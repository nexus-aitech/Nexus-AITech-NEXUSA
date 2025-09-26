-- =======================================================
-- NEXUSA ClickHouse Schema (ClickHouse 24.8 compatible)
-- =======================================================

CREATE DATABASE IF NOT EXISTS nexusa;

-- =======================================================
-- Reference: Symbols
-- =======================================================
CREATE TABLE IF NOT EXISTS nexusa.symbols
(
    symbol_id       UInt32,
    symbol          LowCardinality(String),
    exchange        LowCardinality(String),
    base_asset      LowCardinality(String),
    quote_asset     LowCardinality(String),
    asset_type      LowCardinality(String), -- spot, perp, futures, options
    tick_size       Float64,
    lot_size        Float64,
    contract_size   Float64  DEFAULT 1,
    is_active       UInt8     DEFAULT 1,
    meta            String,
    updated_at      DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (exchange, symbol);

-- =======================================================
-- Raw Trades (ticks)
-- =======================================================
CREATE TABLE IF NOT EXISTS nexusa.trades
(
    ts          DateTime64(3),
    symbol      LowCardinality(String),
    exchange    LowCardinality(String),
    event_id    String,   -- unique id from exchange for dedup
    price       Float64 CODEC(Delta, ZSTD),
    qty         Float64 CODEC(Delta, ZSTD),
    side        Enum8('buy'=1,'sell'=2),
    is_maker    UInt8,
    ingest_ts   DateTime64(3) DEFAULT now64(3),
    ingest_src  LowCardinality(String) DEFAULT 'rest/ws',
    _version    UInt64 DEFAULT toUnixTimestamp64Milli(now64(3))
)
ENGINE = ReplacingMergeTree(_version)
PARTITION BY toYYYYMM(ts)
ORDER BY (symbol, ts, event_id)
TTL toDateTime(ts) + INTERVAL 2 YEAR;

-- =======================================================
-- Quotes (BBO)
-- =======================================================
CREATE TABLE IF NOT EXISTS nexusa.quotes
(
    ts           DateTime64(3),
    symbol       LowCardinality(String),
    exchange     LowCardinality(String),
    bid_price    Float64 CODEC(Gorilla),
    bid_size     Float64 CODEC(Delta, ZSTD),
    ask_price    Float64 CODEC(Gorilla),
    ask_size     Float64 CODEC(Delta, ZSTD),
    mid_price    Float64 MATERIALIZED ((bid_price + ask_price) / 2),
    ingest_ts    DateTime64(3) DEFAULT now64(3),
    _version     UInt64 DEFAULT toUnixTimestamp64Milli(now64(3))
)
ENGINE = ReplacingMergeTree(_version)
PARTITION BY toYYYYMM(ts)
ORDER BY (symbol, ts)
TTL toDateTime(ts) + INTERVAL 1 YEAR;

-- =======================================================
-- Base Candles (1s) from trades
-- =======================================================
CREATE TABLE IF NOT EXISTS nexusa.candles_1s
(
    ts         DateTime,
    symbol     LowCardinality(String),
    exchange   LowCardinality(String),
    open       Float64 CODEC(Gorilla),
    high       Float64 CODEC(Gorilla),
    low        Float64 CODEC(Gorilla),
    close      Float64 CODEC(Gorilla),
    volume     Float64 CODEC(Delta, ZSTD),
    trades     UInt32  DEFAULT 0,
    vwap       Float64 DEFAULT 0 CODEC(Gorilla),
    _ingest_ts DateTime DEFAULT now(),
    _version   UInt64 DEFAULT toUInt64(toUnixTimestamp(now()))
)
ENGINE = ReplacingMergeTree(_version)
PARTITION BY toYYYYMM(ts)
ORDER BY (symbol, ts)
TTL toDateTime(ts) + INTERVAL 3 YEAR;

-- Materialized view: trades → 1s candles
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_trades_to_1s
TO nexusa.candles_1s
AS
SELECT
    toStartOfSecond(ts)                   AS ts,
    symbol,
    exchange,
    argMin(price, ts)                     AS open,
    max(price)                            AS high,
    min(price)                            AS low,
    anyLast(price)                        AS close,
    sum(qty)                              AS volume,
    count()                               AS trades,
    sum(price * qty) / nullIf(sum(qty),0) AS vwap,
    now()                                 AS _ingest_ts,
    toUInt64(toUnixTimestamp(now()))      AS _version
FROM nexusa.trades
GROUP BY ts, symbol, exchange;

-- =======================================================
-- Aggregated Candles (multi-TF)
-- =======================================================
CREATE TABLE IF NOT EXISTS nexusa.candles_agg
(
    bucket_ts       DateTime,
    tf              LowCardinality(String),
    symbol          LowCardinality(String),
    exchange        LowCardinality(String),
    open_state      AggregateFunction(argMin, Float64, DateTime),
    high_state      AggregateFunction(max,     Float64),
    low_state       AggregateFunction(min,     Float64),
    close_state     AggregateFunction(argMax, Float64, DateTime),
    vol_state       AggregateFunction(sum,     Float64),
    trades_state    AggregateFunction(sum,     UInt32),
    vwap_num_state  AggregateFunction(sum,     Float64),
    vwap_den_state  AggregateFunction(sum,     Float64)
)
ENGINE = AggregatingMergeTree
PARTITION BY (tf, toYYYYMM(bucket_ts))
ORDER BY (symbol, tf, bucket_ts);

-- ==============================
-- 1s → 1m
-- ==============================
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1s_to_1m
TO nexusa.candles_agg
AS
SELECT
    toStartOfMinute(ts)                                AS bucket_ts,
    '1m'                                               AS tf,
    symbol,
    exchange,
    argMinState(open, ts)                              AS open_state,
    maxState(high)                                     AS high_state,
    minState(low)                                      AS low_state,
    argMaxState(close, ts)                             AS close_state,
    sumState(volume)                                   AS vol_state,
    sumState(trades)                                   AS trades_state,
    sumState(vwap * volume)                            AS vwap_num_state,
    sumState(volume)                                   AS vwap_den_state
FROM nexusa.candles_1s
GROUP BY bucket_ts, symbol, exchange;

-- ==============================
-- Higher TFs from 1m
-- ==============================
-- Helper Macro: for brevity, each uses StateMerge instead of finalizeAggregation
-- 1m → 5m
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_5m
TO nexusa.candles_agg
AS
SELECT
    toStartOfInterval(bucket_ts, INTERVAL 5 MINUTE) AS bucket_ts,
    '5m'                                            AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                    AS open_state,
    maxStateMerge(high_state)                       AS high_state,
    minStateMerge(low_state)                        AS low_state,
    argMaxStateMerge(close_state)                   AS close_state,
    sumStateMerge(vol_state)                        AS vol_state,
    sumStateMerge(trades_state)                     AS trades_state,
    sumStateMerge(vwap_num_state)                   AS vwap_num_state,
    sumStateMerge(vwap_den_state)                   AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 15m
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_15m
TO nexusa.candles_agg
AS
SELECT
    toStartOfInterval(bucket_ts, INTERVAL 15 MINUTE) AS bucket_ts,
    '15m'                                            AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                     AS open_state,
    maxStateMerge(high_state)                        AS high_state,
    minStateMerge(low_state)                         AS low_state,
    argMaxStateMerge(close_state)                    AS close_state,
    sumStateMerge(vol_state)                         AS vol_state,
    sumStateMerge(trades_state)                      AS trades_state,
    sumStateMerge(vwap_num_state)                    AS vwap_num_state,
    sumStateMerge(vwap_den_state)                    AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 30m
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_30m
TO nexusa.candles_agg
AS
SELECT
    toStartOfInterval(bucket_ts, INTERVAL 30 MINUTE) AS bucket_ts,
    '30m'                                            AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                     AS open_state,
    maxStateMerge(high_state)                        AS high_state,
    minStateMerge(low_state)                         AS low_state,
    argMaxStateMerge(close_state)                    AS close_state,
    sumStateMerge(vol_state)                         AS vol_state,
    sumStateMerge(trades_state)                      AS trades_state,
    sumStateMerge(vwap_num_state)                    AS vwap_num_state,
    sumStateMerge(vwap_den_state)                    AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 1h
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_1h
TO nexusa.candles_agg
AS
SELECT
    toStartOfHour(bucket_ts)                          AS bucket_ts,
    '1h'                                              AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                      AS open_state,
    maxStateMerge(high_state)                         AS high_state,
    minStateMerge(low_state)                          AS low_state,
    argMaxStateMerge(close_state)                     AS close_state,
    sumStateMerge(vol_state)                          AS vol_state,
    sumStateMerge(trades_state)                       AS trades_state,
    sumStateMerge(vwap_num_state)                     AS vwap_num_state,
    sumStateMerge(vwap_den_state)                     AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 2h
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_2h
TO nexusa.candles_agg
AS
SELECT
    toStartOfInterval(bucket_ts, INTERVAL 2 HOUR)     AS bucket_ts,
    '2h'                                              AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                      AS open_state,
    maxStateMerge(high_state)                         AS high_state,
    minStateMerge(low_state)                          AS low_state,
    argMaxStateMerge(close_state)                     AS close_state,
    sumStateMerge(vol_state)                          AS vol_state,
    sumStateMerge(trades_state)                       AS trades_state,
    sumStateMerge(vwap_num_state)                     AS vwap_num_state,
    sumStateMerge(vwap_den_state)                     AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 4h
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_4h
TO nexusa.candles_agg
AS
SELECT
    toStartOfInterval(bucket_ts, INTERVAL 4 HOUR)     AS bucket_ts,
    '4h'                                              AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                      AS open_state,
    maxStateMerge(high_state)                         AS high_state,
    minStateMerge(low_state)                          AS low_state,
    argMaxStateMerge(close_state)                     AS close_state,
    sumStateMerge(vol_state)                          AS vol_state,
    sumStateMerge(trades_state)                       AS trades_state,
    sumStateMerge(vwap_num_state)                     AS vwap_num_state,
    sumStateMerge(vwap_den_state)                     AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 6h
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_6h
TO nexusa.candles_agg
AS
SELECT
    toStartOfInterval(bucket_ts, INTERVAL 6 HOUR)     AS bucket_ts,
    '6h'                                              AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                      AS open_state,
    maxStateMerge(high_state)                         AS high_state,
    minStateMerge(low_state)                          AS low_state,
    argMaxStateMerge(close_state)                     AS close_state,
    sumStateMerge(vol_state)                          AS vol_state,
    sumStateMerge(trades_state)                       AS trades_state,
    sumStateMerge(vwap_num_state)                     AS vwap_num_state,
    sumStateMerge(vwap_den_state)                     AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 8h
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_8h
TO nexusa.candles_agg
AS
SELECT
    toStartOfInterval(bucket_ts, INTERVAL 8 HOUR)     AS bucket_ts,
    '8h'                                              AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                      AS open_state,
    maxStateMerge(high_state)                         AS high_state,
    minStateMerge(low_state)                          AS low_state,
    argMaxStateMerge(close_state)                     AS close_state,
    sumStateMerge(vol_state)                          AS vol_state,
    sumStateMerge(trades_state)                       AS trades_state,
    sumStateMerge(vwap_num_state)                     AS vwap_num_state,
    sumStateMerge(vwap_den_state)                     AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 12h
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_12h
TO nexusa.candles_agg
AS
SELECT
    toStartOfInterval(bucket_ts, INTERVAL 12 HOUR)    AS bucket_ts,
    '12h'                                             AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                      AS open_state,
    maxStateMerge(high_state)                         AS high_state,
    minStateMerge(low_state)                          AS low_state,
    argMaxStateMerge(close_state)                     AS close_state,
    sumStateMerge(vol_state)                          AS vol_state,
    sumStateMerge(trades_state)                       AS trades_state,
    sumStateMerge(vwap_num_state)                     AS vwap_num_state,
    sumStateMerge(vwap_den_state)                     AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- 1m → 1d
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_1m_to_1d
TO nexusa.candles_agg
AS
SELECT
    toStartOfDay(bucket_ts)                            AS bucket_ts,
    '1d'                                               AS tf,
    symbol,
    exchange,
    argMinStateMerge(open_state)                       AS open_state,
    maxStateMerge(high_state)                          AS high_state,
    minStateMerge(low_state)                           AS low_state,
    argMaxStateMerge(close_state)                      AS close_state,
    sumStateMerge(vol_state)                           AS vol_state,
    sumStateMerge(trades_state)                        AS trades_state,
    sumStateMerge(vwap_num_state)                      AS vwap_num_state,
    sumStateMerge(vwap_den_state)                      AS vwap_den_state
FROM nexusa.candles_agg
PREWHERE tf = '1m'
GROUP BY bucket_ts, symbol, exchange;

-- =======================================================
-- Final read view for candles
-- =======================================================
CREATE OR REPLACE VIEW nexusa.candles AS
SELECT
    bucket_ts AS ts,
    tf,
    symbol,
    exchange,
    finalizeAggregation(open_state)   AS open,
    finalizeAggregation(high_state)   AS high,
    finalizeAggregation(low_state)    AS low,
    finalizeAggregation(close_state)  AS close,
    finalizeAggregation(vol_state)    AS volume,
    finalizeAggregation(trades_state) AS trades,
    finalizeAggregation(vwap_num_state) / nullIf(finalizeAggregation(vwap_den_state), 0) AS vwap
FROM nexusa.candles_agg;

-- =======================================================
-- Feature Store
-- =======================================================
CREATE TABLE IF NOT EXISTS nexusa.features
(
    event_ts      DateTime64(3),
    entity_type   LowCardinality(String) DEFAULT 'symbol',
    entity_id     LowCardinality(String),
    feature_ns    LowCardinality(String),
    feature_name  LowCardinality(String),
    value_float   Nullable(Float64) CODEC(Gorilla),
    value_int     Nullable(Int64)   CODEC(Delta, ZSTD),
    value_str     Nullable(String)  CODEC(ZSTD),
    quality       LowCardinality(String) DEFAULT 'ok',
    source        LowCardinality(String) DEFAULT 'calc',
    producer_id   LowCardinality(String) DEFAULT 'fe',
    version       UInt64 DEFAULT toUnixTimestamp64Milli(now64(3)),
    row_hash      UInt64 MATERIALIZED cityHash64(entity_type, entity_id, feature_ns, feature_name, event_ts),
    ingest_ts     DateTime64(3) DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(event_ts)
ORDER BY (entity_type, entity_id, feature_ns, feature_name, event_ts, row_hash)
TTL toDateTime(event_ts) + INTERVAL 3 YEAR;

-- Latest state (nullable states مطابق منبع)
CREATE TABLE IF NOT EXISTS nexusa.features_latest_state
(
    entity_type        LowCardinality(String),
    entity_id          LowCardinality(String),
    feature_ns         LowCardinality(String),
    feature_name       LowCardinality(String),
    value_float_state  AggregateFunction(argMax, Nullable(Float64), UInt64),
    value_int_state    AggregateFunction(argMax, Nullable(Int64),   UInt64),
    value_str_state    AggregateFunction(argMax, Nullable(String),  UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY (entity_type, entity_id, feature_ns, feature_name);

-- MV → latest states
CREATE MATERIALIZED VIEW IF NOT EXISTS nexusa.mv_features_to_latest
TO nexusa.features_latest_state
AS
SELECT
    entity_type, entity_id, feature_ns, feature_name,
    argMaxState(value_float, version) AS value_float_state,
    argMaxState(value_int,   version) AS value_int_state,
    argMaxState(value_str,   version) AS value_str_state
FROM nexusa.features
GROUP BY entity_type, entity_id, feature_ns, feature_name;

-- View برای خواندن آخرین مقادیر
CREATE OR REPLACE VIEW nexusa.features_latest AS
SELECT
    entity_type,
    entity_id,
    feature_ns,
    feature_name,
    finalizeAggregation(value_float_state) AS value_float,
    finalizeAggregation(value_int_state)   AS value_int,
    finalizeAggregation(value_str_state)   AS value_str
FROM nexusa.features_latest_state;

-- =======================================================
-- Projections
-- =======================================================
ALTER TABLE nexusa.candles_1s
ADD PROJECTION IF NOT EXISTS p_by_symbol_ts
(
    SELECT ts, open, high, low, close, volume, trades
    ORDER BY (symbol, ts)
);

ALTER TABLE nexusa.features
ADD PROJECTION IF NOT EXISTS p_recent_feature
(
    SELECT event_ts, entity_id, feature_ns, feature_name, value_float, version
    WHERE event_ts >= now() - INTERVAL 30 DAY
    ORDER BY (entity_id, feature_ns, feature_name, event_ts)
);

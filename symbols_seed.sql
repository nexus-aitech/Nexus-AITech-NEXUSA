-- =======================================================
-- Seed file: Insert trading pairs into nexusa.symbols
-- Exchange: Binance
-- Generated for production-grade initialization
-- =======================================================

INSERT INTO nexusa.symbols
(
    symbol_id,
    symbol,
    exchange,
    base_asset,
    quote_asset,
    asset_type,
    tick_size,
    lot_size,
    contract_size,
    is_active,
    meta
)
VALUES
    (1, 'PAXGUSDT', 'binance', 'PAXG', 'USDT', 'spot', 0.01,    0.0001, 1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (2, 'BTCUSDT',  'binance', 'BTC',  'USDT', 'spot', 0.01,    0.0001, 1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (3, 'ETHUSDT',  'binance', 'ETH',  'USDT', 'spot', 0.01,    0.001,  1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (4, 'XRPUSDT',  'binance', 'XRP',  'USDT', 'spot', 0.0001,  1,      1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (5, 'BNBUSDT',  'binance', 'BNB',  'USDT', 'spot', 0.01,    0.001,  1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (6, 'SOLUSDT',  'binance', 'SOL',  'USDT', 'spot', 0.001,   0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (7, 'NEARUSDT', 'binance', 'NEAR', 'USDT', 'spot', 0.0001,  0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (8, 'APTUSDT',  'binance', 'APT',  'USDT', 'spot', 0.001,   0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (9, 'ICPUSDT',  'binance', 'ICP',  'USDT', 'spot', 0.001,   0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (10,'AAVEUSDT', 'binance', 'AAVE', 'USDT', 'spot', 0.01,    0.001,  1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (11,'RNDERUSDT','binance', 'RNDER','USDT', 'spot', 0.0001,  0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (12,'TAOUSDT',  'binance', 'TAO',  'USDT', 'spot', 0.01,    0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (13,'VETUSDT',  'binance', 'VET',  'USDT', 'spot', 0.00001, 1,      1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (14,'FETUSDT',  'binance', 'FET',  'USDT', 'spot', 0.0001,  0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (15,'ALGOUSDT', 'binance', 'ALGO', 'USDT', 'spot', 0.0001,  1,      1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (16,'ARBUSDT',  'binance', 'ARB',  'USDT', 'spot', 0.0001,  0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (17,'FILUSDT',  'binance', 'FIL',  'USDT', 'spot', 0.001,   0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (18,'ENAUSDT',  'binance', 'ENA',  'USDT', 'spot', 0.0001,  0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (19,'ATOMUSDT', 'binance', 'ATOM', 'USDT', 'spot', 0.001,   0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (20,'OPUSDT',   'binance', 'OP',   'USDT', 'spot', 0.0001,  0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (21,'WIFUSDT',  'binance', 'WIF',  'USDT', 'spot', 0.0001,  0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (22,'FLOKIUSDT','binance', 'FLOKI','USDT', 'spot', 0.0000001,1000,  1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (23,'TIAUSDT',  'binance', 'TIA',  'USDT', 'spot', 0.0001,  0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (24,'GRTUSDT',  'binance', 'GRT',  'USDT', 'spot', 0.0001,  0.1,    1, 1, '{"source":"binance","inserted_by":"seed_script"}'),
    (25,'TONUSDT',  'binance', 'TON',  'USDT', 'spot', 0.001,   0.01,   1, 1, '{"source":"binance","inserted_by":"seed_script"}');

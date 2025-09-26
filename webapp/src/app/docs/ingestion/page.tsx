// ============================================================================
// FILE: app/docs/ingestion/page.tsx
// ----------------------------------------------------------------------------
import React from "react";
export const metadata = { title: "Ingestion" };
export default function IngestionPage() {
return (
<article>
<h1 id="ingestion">Ingestion</h1>
<p>
The ingestion service streams/polls market data from supported exchanges and persists normalized OHLCV & trades.
</p>
<h2 id="exchanges">Supported Exchanges</h2>
<ul>
<li>Binance, KuCoin, Bitget, CoinEx, BingX, OKX, Bybit (REST/WS as configured).</li>
</ul>
<h2 id="config">Configuration</h2>
<pre><code>{`env:
INGEST_SYMBOLS=BTC/USDT,ETH/USDT
INGEST_INTERVAL=1h
CLICKHOUSE_URL=http://clickhouse:8123
REDIS_URL=redis://redis:6379`}</code></pre>
<h2 id="resilience">Resilience</h2>
<ul>
<li>Graceful reconnects; jittered backoff; partial record dedupe.</li>
<li>JSON schema for payloads; strict type casting; UTC timestamping.</li>
</ul>
</article>
);
}
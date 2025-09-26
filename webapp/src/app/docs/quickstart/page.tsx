// ============================================================================
// FILE: app/docs/quickstart/page.tsx
// ----------------------------------------------------------------------------
import React from "react";
export const metadata = { title: "Quickstart" };
export default function QuickstartPage() {
return (
<article>
<h1 id="quickstart">Quickstart</h1>
<ol>
<li>
<strong>Clone & Env</strong>: Provide <code>.env</code> with exchange API keys and service URLs.
</li>
<li>
<strong>Docker Up</strong>: <code>docker-compose up -d</code> (clickhouse, redis, redpanda, minio, api, webapp, ingestion).
</li>
<li>
<strong>Smoke Tests</strong>: <code>GET /health</code> (API), verify webapp <code>/</code>, and ingestion logs pulling markets.
</li>
<li>
<strong>First Instrument</strong>: Configure <code>BTCUSDT, 1h, 300 bars</code> and validate indicators.
</li>
<li>
<strong>Backtest</strong>: Run a short baseline (RSI/ADX/VWAP). Compare equity/Sharpe/max‑DD.
</li>
<li>
<strong>Observability</strong>: Enable structured logs and metrics exports (Prometheus/Grafana if present).
</li>
</ol>
<h2 id="production-notes">Production Notes</h2>
<ul>
<li>Stateless containers, persistent volumes for ClickHouse/MinIO.</li>
<li>Idempotent pipelines; retries with exponential backoff.</li>
<li>Deterministic backtests (seeded), artifacted to MinIO/MLflow.</li>
</ul>
</article>
);
}
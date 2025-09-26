// ============================================================================
// FILE: app/docs/api/rest/page.tsx
// ----------------------------------------------------------------------------
import React from "react";
export const metadata = { title: "REST API" };
export default function RestApiPage() {
return (
<article>
<h1 id="rest">REST API</h1>
<p>Stable, versioned endpoints for data, features, and signals.</p>
<h2 id="endpoints">Endpoints</h2>
<ul>
<li><code>GET /api/health</code> — service health.</li>
<li><code>GET /api/candles?symbol=BTCUSDT&tf=1h&limit=300</code> — OHLCV.</li>
<li><code>GET /api/indicators?symbol=BTCUSDT&tf=1h</code> — computed features.</li>
<li><code>GET /api/signals/latest?symbol=BTCUSDT&tf=1h</code> — latest signal.</li>
<li><code>POST /api/backtest</code> — launch backtest job.</li>
</ul>
<h2 id="auth">Auth</h2>
<p>Token header: <code>Authorization: Bearer &lt;token&gt;</code> (configurable provider).</p>
<h2 id="errors">Errors</h2>
<pre><code>{`{
"error": "INVALID_SYMBOL",
"message": "Symbol not supported"
}`}</code></pre>
</article>
);
}
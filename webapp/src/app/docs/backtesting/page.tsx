// ============================================================================
// FILE: app/docs/backtesting/page.tsx
// ----------------------------------------------------------------------------
import React from "react";
export const metadata = { title: "Backtesting" };
export default function BacktestingPage() {
return (
<article>
<h1 id="backtesting">Backtesting</h1>
<p>
Deterministic, multi‑asset backtests with robust metrics and reproducible seeds.
</p>
<h2 id="metrics">Core Metrics</h2>
<ul>
<li>Equity curve, Sharpe, Sortino, Max Drawdown, Hit Rate, Avg Win/Loss, Exposure.</li>
</ul>
<h2 id="example">Example</h2>
<pre><code>{`POST /api/backtest
{
"symbol": "BTCUSDT",
"timeframe": "1h",
"bars": 300,
"strategy": "momentum_breakout"
}`}</code></pre>
<h2 id="repro">Reproducibility</h2>
<ul>
<li>Strategy version pinning; dataset snapshot; RNG seeding; artifact logging.</li>
</ul>
</article>
);
}
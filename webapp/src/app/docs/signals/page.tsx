// ============================================================================
// FILE: app/docs/signals/page.tsx
// ----------------------------------------------------------------------------
import React from "react";
export const metadata = { title: "Signals" };
export default function SignalsPage() {
return (
<article>
<h1 id="signals">Signal Engine</h1>
<p>
Signal generation combines indicator rules and optional ML features. Rules are composable, testable, and versioned.
</p>
<h2 id="indicators">Indicators</h2>
<ul>
<li>ADX / DI, ATR, VWAP, Ichimoku, Stoch RSI, OBV, custom factors.</li>
</ul>
<h2 id="dsl">Rule DSL</h2>
<pre><code>{`rule "momentum_breakout" {
if: adx(14) > 22 && price.crosses(vwap()) && stoch_rsi().k < 80
then: signal.buy("MOMENTUM")
else: signal.none()
}`}</code></pre>
<h2 id="validation">Validation</h2>
<ul>
<li>Unit tests for rules; reference datasets; drift alerts on distribution shift.</li>
</ul>
</article>
);
}
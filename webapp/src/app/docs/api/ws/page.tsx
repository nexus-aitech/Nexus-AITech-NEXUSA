// ============================================================================
// FILE: app/docs/api/ws/page.tsx
// ----------------------------------------------------------------------------
import React from "react";
export const metadata = { title: "WebSocket API" };
export default function WsApiPage() {
return (
<article>
<h1 id="websocket">WebSocket API</h1>
<p>Low‑latency streaming for ticks, candles, features, and signals.</p>
<h2 id="channels">Channels</h2>
<ul>
<li><code>candles:{`{symbol}`}:{`{tf}`}</code></li>
<li><code>features:{`{symbol}`}:{`{tf}`}</code></li>
<li><code>signals:{`{symbol}`}:{`{tf}`}</code></li>
</ul>
<h2 id="client">Client Example</h2>
<pre><code>{`const ws = new WebSocket("wss://api.nexusa.ai/ws");
ws.onopen = () => ws.send(JSON.stringify({ op: "subscribe", ch: "signals:BTCUSDT:1h" }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));`}</code></pre>
<h2 id="qos">QoS & Resilience</h2>
<ul>
<li>Heartbeat & resubscribe; sequence IDs; backpressure via buffer thresholds.</li>
</ul>
</article>
);
}
// DataOverview.tsx (داخل Webapp)
"use client";
import { useEffect, useState } from "react";

type Signal = {
  symbol: string;
  tf: string;
  direction: string;
  score: number;
  created_at: string;
};

export default function DataOverview() {
  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    fetch("http://localhost:8000/api/signals?symbol=BTCUSDT&tf=1h&limit=10")
      .then((res) => res.json())
      .then((data) => setSignals(data))
      .catch((err) => console.error("API Error:", err));
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Live Signals</h2>
      {signals.length === 0 && <p>No data available.</p>}
      <ul className="space-y-2">
        {signals.map((sig, i) => (
          <li key={i} className="p-2 rounded border border-gray-300">
            <strong>{sig.symbol}</strong> | {sig.tf} | {sig.direction} |{" "}
            Confidence: {Math.round(sig.score * 100)}% <br />
            Time: {new Date(sig.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

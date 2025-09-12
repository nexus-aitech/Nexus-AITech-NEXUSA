// webapp/src/app/charts/page.tsx
"use client";
import Link from "next/link";
import Chart from "@/components/ui/Chart";

export default function ChartsPage() {
  const data = [
    { x: "09:00", price: 101, volume: 230, signal: 0.4 },
    { x: "09:05", price: 103, volume: 180, signal: 0.6 },
    // ...
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl text-white font-bold">Charts & Analytics</h1>
      <Chart
        data={data}
        series={[
          { key: "price", name: "Price", kind: "line", strokeWidth: 2 },
          { key: "signal", name: "Signal", kind: "area", gradient: true, yAxis: "right" },
          { key: "volume", name: "Volume", kind: "bar",   yAxis: "right" },
        ]}
        yLeftLabel="Price"
        yRightLabel="Signal / Volume"
        xTickFormatter={(v) => String(v)}
        yLeftTickFormatter={(v) => v.toFixed(2)}
        yRightTickFormatter={(v) => v.toLocaleString()}
      />
    </div>
  );
}
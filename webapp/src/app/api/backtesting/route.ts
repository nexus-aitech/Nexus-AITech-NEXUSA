import { NextRequest, NextResponse } from "next/server";

interface BacktestRequest {
  symbol: string;
  strategy: string;
  tf: string; // timeframe
  from?: string;
  to?: string;
}

function runMockBacktest({ symbol, strategy, tf }: BacktestRequest) {
  // Mock performance results
  return {
    symbol,
    strategy,
    timeframe: tf,
    trades: 42,
    winRate: 0.61,
    profitFactor: 1.85,
    netProfit: 1520.45,
    maxDrawdown: -12.3,
    sharpeRatio: 1.42,
    equityCurve: Array.from({ length: 50 }, (_, i) => ({
      step: i,
      balance: 10000 + Math.sin(i / 5) * 500 + i * 50,
    })),
    startedAt: new Date().toISOString(),
    finishedAt: new Date(Date.now() + 1500).toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const strategy = searchParams.get("strategy") || "rsi_macd";
  const tf = searchParams.get("tf") || "1h";

  const payload = runMockBacktest({ symbol, strategy, tf });

  return NextResponse.json(payload, { status: 200 });
}

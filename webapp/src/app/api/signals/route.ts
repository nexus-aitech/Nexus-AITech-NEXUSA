import { NextResponse } from "next/server"
import ccxt from "ccxt"
import { ADX, ATR, OBV, Stochastic } from "technicalindicators"

// Helper: fetch candles
async function fetchOHLCV(symbol: string, timeframe: string, limit = 300) {
  const binance = new ccxt.binance({ enableRateLimit: true })
  const ohlcv = await binance.fetchOHLCV(symbol, timeframe, undefined, limit)
  return {
    time: ohlcv.map(c => c[0]),
    open: ohlcv.map(c => c[1]),
    high: ohlcv.map(c => c[2]),
    low: ohlcv.map(c => c[3]),
    close: ohlcv.map(c => c[4]),
    volume: ohlcv.map(c => c[5]),
  }
}

// VWAP
function calcVWAP({ high, low, close, volume }: any) {
  const typicalPrice = close.map((c: number, i: number) => (high[i] + low[i] + c) / 3)
  const cumPV = typicalPrice.map((tp: number, i: number) => tp * volume[i])
  const cumPVSum = cumPV.reduce((a, b, i) => a + b, 0)
  const cumVol = volume.reduce((a: number, b: number) => a + b, 0)
  return cumPVSum / cumVol
}

// Ichimoku
function calcIchimoku({ high, low }: any) {
  const period9 = 9
  const period26 = 26
  const period52 = 52

  const lastIdx = high.length - 1
  const slice = (arr: number[], len: number) => arr.slice(-len)

  const avg = (arr: number[]) => (Math.max(...arr) + Math.min(...arr)) / 2

  return {
    tenkan: avg(slice(high, period9)) || null,
    kijun: avg(slice(high, period26)) || null,
    senkouA: ((avg(slice(high, period9)) + avg(slice(high, period26))) / 2) || null,
    senkouB: avg(slice(high, period52)) || null,
  }
}

// API
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get("symbol") || "BTC/USDT"
    const tf = searchParams.get("tf") || "1h"
    const limit = Number(searchParams.get("limit") || 300)

    const ohlcv = await fetchOHLCV(symbol, tf, limit)

    // Indicators
    const adx = ADX.calculate({
      high: ohlcv.high,
      low: ohlcv.low,
      close: ohlcv.close,
      period: 14,
    }).at(-1)

    const atr = ATR.calculate({
      high: ohlcv.high,
      low: ohlcv.low,
      close: ohlcv.close,
      period: 14,
    }).at(-1)

    const obv = OBV.calculate({
      close: ohlcv.close,
      volume: ohlcv.volume,
    }).at(-1)

    const stoch = Stochastic.calculate({
      high: ohlcv.high,
      low: ohlcv.low,
      close: ohlcv.close,
      period: 14,
      signalPeriod: 3,
    }).at(-1)

    const vwap = calcVWAP(ohlcv)
    const ichimoku = calcIchimoku(ohlcv)

    return NextResponse.json({
      symbol,
      timeframe: tf,
      price: ohlcv.close.at(-1),
      indicators: {
        adx,
        atr,
        obv,
        stoch,
        vwap,
        ichimoku,
      },
    })
  } catch (err: any) {
    console.error("API error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

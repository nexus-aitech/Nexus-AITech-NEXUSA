import { NextRequest, NextResponse } from "next/server";

interface ReportParams {
  symbol: string;
  lang: "en" | "fa";
  range: "daily" | "weekly" | "monthly";
}

function generateMockReport({ symbol, lang, range }: ReportParams) {
  const title =
    lang === "fa"
      ? `📊 گزارش ${symbol} (${range})`
      : `📊 ${symbol} Report (${range})`;

  const summary =
    lang === "fa"
      ? `${symbol} در بازه ${range} دچار نوساناتی بوده. روند کلی در حال تقویت است.`
      : `${symbol} in the ${range} timeframe has shown volatility. Overall trend is strengthening.`;

  const insights = [
    {
      id: 1,
      text:
        lang === "fa"
          ? "RSI در محدوده اشباع خرید قرار دارد."
          : "RSI is in overbought territory.",
    },
    {
      id: 2,
      text:
        lang === "fa"
          ? "حجم معاملات افزایش محسوسی داشته است."
          : "Trading volume has significantly increased.",
    },
    {
      id: 3,
      text:
        lang === "fa"
          ? "احتمال اصلاح کوتاه‌مدت وجود دارد."
          : "Short-term correction is likely.",
    },
  ];

  return { title, summary, insights, generatedAt: new Date().toISOString() };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const lang = (searchParams.get("lang") as "en" | "fa") || "en";
  const range =
    (searchParams.get("range") as "daily" | "weekly" | "monthly") || "daily";

  const payload = generateMockReport({ symbol, lang, range });

  return NextResponse.json(payload, { status: 200 });
}

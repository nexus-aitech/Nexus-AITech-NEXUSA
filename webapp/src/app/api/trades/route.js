import { NextResponse } from 'next/server';
import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_URL,           // e.g. https://localhost:8123
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '009922333777313',
  database: process.env.CLICKHOUSE_DB || 'nexusa',
  // فقط برای محیط dev با self-signed
  tls: { rejectUnauthorized: false },
});

export async function GET() {
  try {
    const q = `
      SELECT ts, symbol, exchange, price, qty
      FROM nexusa.trades
      ORDER BY ts DESC
      LIMIT 20
    `;
    const r = await client.query({ query: q, format: 'JSONEachRow' });
    const rows = await r.json();
    return NextResponse.json({ data: rows });
  } catch (e) {
    console.error('ClickHouse error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

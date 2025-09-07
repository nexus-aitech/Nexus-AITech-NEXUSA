# ورود/خروج به صرافی‌ها (Exchange Inflows/Outflows) — نسخهٔ ارتقایافتهٔ جهانی

این سند چارچوبی **Production-Grade** برای تحلیل جریان ورود و خروج دارایی‌ها به/از صرافی‌ها ارائه می‌دهد. هدف، تبدیل داده‌های آن‌چین به **سیگنال‌های قابل‌اتکا** جهت تصمیم‌گیری در ترید، مدیریت ریسک و تحقیقات بازار است.

---

## 1) تعریف و دامنه

* **Exchange Inflow:** دارایی‌هایی که به کیف‌پول‌های برچسب‌خوردهٔ صرافی واریز می‌شوند؛ نشانهٔ افزایش فشار فروش بالقوه.
* **Exchange Outflow:** دارایی‌هایی که از صرافی‌ها خارج می‌شوند؛ نشانهٔ ذخیره‌سازی (Cold Storage) یا انباشت کاربران.
* **Netflow:** اختلاف بین Inflow و Outflow.

### دامنهٔ پوشش

* **Chains:** BTC (UTXO)، ETH و EVM chains، L2ها (Arbitrum, Optimism, Base)، Solana، Tron.
* **Assets:** BTC، ETH، Stablecoins (USDT, USDC, DAI, BUSD)، آلت‌کوین‌های لیکوئید.
* **Entities:** صرافی‌های متمرکز (CEXها)، کیف‌های سرد/گرم، کیف‌های مارجین/دیفای.

---

## 2) متریک‌های کلیدی

* **Netflow = Inflow − Outflow** (برحسب دارایی و USD).
* **Exchange Balance:** موجودی کل کیف‌های صرافی.
* **Stablecoin Netflow:** جریان خالص استیبل‌کوین‌ها؛ نشانگر «قدرت خرید بالقوه».
* **%Supply on Exchange:** نسبت دارایی ذخیره‌شده در صرافی به عرضه در گردش.
* **Velocity Metrics:** نرخ گردش دارایی‌ها بین صرافی‌ها و کیف‌های شخصی.
* **Inflow/Outflow by Entity:** تفکیک جریان به سطح صرافی یا دسته‌بندی خوشه‌ها.

---

## 3) تفسیر و کاربرد

* **Inflow Spike + Price Drop →** فشار فروش / Panic.
* **Sustained Outflow + Sideways Price →** انباشت / انتقال به کیف‌های سرد.
* **Stablecoin Inflow ↑ →** ورود نقدینگی تازه؛ احتمال افزایش تقاضا.
* **Negative Netflow در بلندمدت →** کاهش فشار فروش و انباشت سیستماتیک.
* **Whale Outflows →** خروج سرمایه‌گذاران بزرگ؛ نیازمند تأیید با داده‌های دیگر.

---

## 4) خطاهای رایج و ضدالگوها

* **جابجایی داخلی صرافی:** انتقال بین کیف‌های گرم/سرد نباید به‌عنوان inflow/outflow محسوب شود.
* **Bridge Transfers:** انتقال میان‌زنجیره‌ای می‌تواند سیگنال کاذب ایجاد کند.
* **عدم نرمال‌سازی:** مقایسه جریان‌ها بدون توجه به موجودی صرافی یا مارکت‌کپ گمراه‌کننده است.
* **Liquidity Provision:** سپرده‌گذاری در پروتکل‌ها/بازارهای مارجین را با inflow اشتباه نگیرید.

---

## 5) چک‌لیست تحلیل حرفه‌ای

* ✅ منبع برچسب‌ها (Labels) و سطح اعتماد.
* ✅ نرمال‌سازی جریان‌ها به موجودی صرافی/مارکت‌کپ/حجم معاملات.
* ✅ تعریف آستانه‌های معنادار (p90, p95، z-score).
* ✅ تقاطع با قیمت، مشتقات (Funding, OI)، احساسات (Sentiment).
* ✅ جداسازی داده‌های L1 و L2 + Bridgeها.
* ✅ تفکیک دارایی (BTC، ETH، Stablecoins، آلت‌کوین‌ها).

---

## 6) کوئری‌های نمونه (SQL/Pseudo)

### 6.1) Netflow روزانه (ERC-20)

```sql
SELECT date_trunc('day', block_time) AS d,
  SUM(CASE WHEN to_entity IN (:cex) THEN amount ELSE 0 END) AS inflow,
  SUM(CASE WHEN from_entity IN (:cex) THEN amount ELSE 0 END) AS outflow,
  SUM(CASE WHEN to_entity IN (:cex) THEN amount ELSE 0 END)
   - SUM(CASE WHEN from_entity IN (:cex) THEN amount ELSE 0 END) AS netflow
FROM token_transfers_enriched
WHERE block_time BETWEEN :t0 AND :t1 AND symbol=:asset
GROUP BY 1
ORDER BY 1;
```

### 6.2) %Supply on Exchanges (BTC)

```sql
SELECT ts,
  SUM(balance_btc) / total_supply_btc * 100 AS pct_on_exchange
FROM entity_balances
WHERE entity_type='exchange'
GROUP BY 1
ORDER BY 1;
```

---

## 7) پایپ‌لاین پایتون (Prod-ready Skeleton)

```python
import pandas as pd

class ExchangeFlows:
    def __init__(self, db):
        self.db = db

    def netflow(self, symbol, t0, t1, freq='1D'):
        q = """
        SELECT block_time, from_entity, to_entity, amount
        FROM token_transfers_enriched
        WHERE block_time BETWEEN :t0 AND :t1 AND symbol=:sym
        """
        df = self.db.read_sql(q, params={'t0': t0, 't1': t1, 'sym': symbol})
        df['dir'] = df.apply(lambda r: 1 if r['to_entity'] == 'cex' else (-1 if r['from_entity'] == 'cex' else 0), axis=1)
        df['net'] = df['amount'] * df['dir']
        return df.set_index('block_time')['net'].resample(freq).sum().to_frame('netflow')
```

---

## 8) آستانه‌ها و هشدارها

* **Inflow Spike ≥ p95 تاریخی →** سیگنال فروش.
* **Outflow Spike ≥ p95 تاریخی →** سیگنال انباشت.
* **Stablecoin Inflow بالا + افزایش Open Interest →** احتمال Long Squeeze.
* **کاهش %Supply on Exchanges در بازه بلندمدت →** انباشت ساختاری.

---

## 9) گزارش‌دهی و داشبورد

* **گزارش روزانه/هفتگی:** خلاصه inflow/outflow، Netflow، Stablecoin Flows.
* **داشبورد KPIs:** Netflow به USD، Balance Exchangeها، Stablecoin Inflows، %Supply on Exchanges.
* **Drill-down:** بر اساس صرافی، دارایی، زنجیره.

---

## 10) جمع‌بندی

تحلیل ورود/خروج به صرافی‌ها یکی از پرکاربردترین ابزارهای **On-chain Intelligence** است. اما باید همراه با **نرمال‌سازی، ضدالگوها و داده‌های مکمل (قیمت، مشتقات، احساسات)** تفسیر شود.

پلتفرم‌ها و تیم‌هایی که این چارچوب را به‌کار بگیرند، قادر خواهند بود سیگنال‌های قابل اعتماد و جهانی تولید کنند.

# شناسایی و پایش حرکات نهنگ‌ها (Whale Tracking) — نسخهٔ ارتقایافتهٔ جهانی

این سند چارچوبی **Production-Grade** برای شناسایی، پایش و تحلیل حرکات نهنگ‌ها (Whales) در دارایی‌های دیجیتال ارائه می‌دهد. هدف، ایجاد یک **سیستم هشدار و گزارش‌دهی قابل اعتماد** برای تیم‌های ترید، ریسک و تحقیق است.

---

## 1) تعریف نهنگ

* **Whale Entity:** آدرس/خوشه‌ای که موجودی یا تراکنش‌های آن نسبت به بازار هدف غیرمعمول بزرگ است.
* **آستانه‌های وابسته به دارایی:**

  * BTC: ≥ 1,000 BTC
  * ETH: ≥ 10,000 ETH
  * Stablecoins: ≥ 10M USDT/USDC
* **آستانه‌های پویا:** Percentile-based (Top 1%, Top 0.1%) بر اساس توزیع دارایی.

> نکته: تعریف نهنگ باید همواره با **نقدشوندگی دارایی و شرایط بازار** تطبیق داده شود.

---

## 2) روش‌های شناسایی

* **Tagging/Labeling:** خوشه‌های شناخته‌شده (CEX، صندوق‌ها، DAOها، پروژه‌ها).
* **Heuristics:** الگوهای رفتاری (زمان‌بندی، تعامل با قراردادها، ورودی/خروجی‌های بزرگ).
* **Event Detection:** تراکنش‌های بزرگ، سپرده/برداشت صرافی، مشارکت در Proposalها.
* **Clustering:** استفاده از هیوریستیک‌های on-chain برای اتصال چندین آدرس به یک نهاد.

---

## 3) سیگنال‌های کلیدی

* **Large Transfers:** تراکنش‌های بزرگ بالاتر از آستانهٔ پویا.
* **Exchange Deposits/Withdrawals:** تغییر رفتار نهنگ‌ها در تعامل با CEXها.
* **Concentration Metrics:** تغییر سهم Top 10، Top 100 در موجودی کل.
* **Dormant Whale Activation:** فعال شدن کوین‌های قدیمی در کیف‌پول‌های نهنگ.
* **Cross-chain Moves:** انتقال دارایی بین زنجیره‌ها/بریج‌ها.

---

## 4) محدودیت‌ها و ضدالگوها

* **Splitting Transactions:** تقسیم یک تراکنش بزرگ به چند بخش کوچک.
* **Mixing/CoinJoin/Privacy Tools:** پنهان‌سازی هویت تراکنش‌ها.
* **Internal Transfers:** جابجایی داخلی صرافی یا خزانه.
* **False Positives:** تراکنش‌های نگهداری یا مهاجرت قرارداد.

---

## 5) چک‌لیست تحلیلی

* ✅ تعریف آستانهٔ پویا متناسب با دارایی.
* ✅ فیلتر برچسب‌های داخلی (CEX wallets).
* ✅ نرمال‌سازی نسبت به نقدشوندگی دارایی (MCAP, Volume).
* ✅ ثبت عدم قطعیت و منبع هر سیگنال.
* ✅ تقاطع با داده‌های بازار (قیمت، Funding، مشتقات).

---

## 6) متریک‌ها و KPIها

* **Whale Netflow to Exchanges:** خالص جریان نهنگ‌ها به/از صرافی‌ها.
* **Top Holder Concentration:** درصد مالکیت Top 10/100 آدرس.
* **Whale Transaction Count:** تعداد تراکنش‌های بالای آستانه در بازهٔ زمانی.
* **Dormancy Metrics:** Coin Days Destroyed (CDD) توسط نهنگ‌ها.
* **Cross-Asset Behavior:** همبستگی حرکات نهنگ‌ها بین دارایی‌ها.

---

## 7) کوئری‌های نمونه (SQL/Pseudo)

### 7.1) تراکنش‌های بزرگ

```sql
SELECT tx_hash, block_time, from_entity, to_entity, amount_usd
FROM transfers_enriched
WHERE amount_usd >= :threshold
  AND block_time BETWEEN :t0 AND :t1
ORDER BY amount_usd DESC;
```

### 7.2) Concentration Top Holders

```sql
SELECT ts,
  SUM(balance) FILTER (WHERE rank <= 10) / SUM(balance) AS pct_top10,
  SUM(balance) FILTER (WHERE rank <= 100) / SUM(balance) AS pct_top100
FROM entity_ranked_balances
WHERE ts BETWEEN :t0 AND :t1
GROUP BY ts;
```

---

## 8) پایپ‌لاین پایتون (Prod-ready Skeleton)

```python
import pandas as pd

class WhaleTracking:
    def __init__(self, db):
        self.db = db

    def large_transfers(self, threshold_usd, t0, t1):
        q = """
        SELECT block_time, from_entity, to_entity, amount_usd
        FROM transfers_enriched
        WHERE amount_usd >= :th AND block_time BETWEEN :t0 AND :t1
        """
        df = self.db.read_sql(q, params={'th': threshold_usd, 't0': t0, 't1': t1})
        return df.sort_values('amount_usd', ascending=False)

    def concentration(self, t0, t1, freq='1D'):
        q = "SELECT ts, rank, balance FROM entity_ranked_balances WHERE ts BETWEEN :t0 AND :t1"
        df = self.db.read_sql(q, params={'t0': t0, 't1': t1})
        top10 = df[df['rank'] <= 10].groupby('ts')['balance'].sum()
        total = df.groupby('ts')['balance'].sum()
        return (top10/total).resample(freq).last().to_frame('pct_top10')
```

---

## 9) آستانه‌ها و هشدارها

* **Whale Inflow به CEX ≥ p95 تاریخی →** احتمال فشار فروش.
* **Whale Outflow از CEX ≥ p95 تاریخی →** انباشت احتمالی.
* **افزایش Concentration Top 10 ≥ 2% در بازه کوتاه →** خطر تمرکز.
* **Dormant Whale Activation Spike →** افزایش نوسانات بالقوه.

---

## 10) گزارش‌دهی و داشبورد

* **گزارش هفتگی:**

  * بزرگ‌ترین تراکنش‌ها (Top 20)
  * جریان خالص نهنگ‌ها به صرافی‌ها
  * تغییر تمرکز مالکیت
  * فعال‌سازی نهنگ‌های قدیمی
* **داشبورد KPIs:**

  * Whale Netflow (USD)
  * Concentration (Top 10/100)
  * Whale Large Tx Count
  * Dormancy Metrics

---

## 11) جمع‌بندی

پایش نهنگ‌ها یکی از ابزارهای کلیدی **On-chain Intelligence** است. اما تفسیر سیگنال‌ها باید همواره همراه با **نقدشوندگی، ضدالگوها و داده‌های مکمل** انجام شود. چارچوب حاضر امکان **هشداردهی به‌موقع، تحلیل دقیق و گزارش‌گیری استاندارد جهانی** را فراهم می‌کند.

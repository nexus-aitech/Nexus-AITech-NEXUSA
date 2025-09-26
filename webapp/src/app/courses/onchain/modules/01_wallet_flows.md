# رصد جریان کیف‌پول‌ها (Wallet Flows) — نسخهٔ ارتقایافتهٔ جهانی

این راهنما چارچوبی عملیاتی و استاندارد جهانی برای **تحلیل جریان آن‌چین کیف‌پول‌ها** در شبکه‌های UTXO (مانند بیت‌کوین) و Account-based (مانند اتریوم) ارائه می‌دهد. هدف، تبدیل مفاهیم پراکنده به یک **پروتکل تحلیل‌پذیر، تکرارپذیر و گزارش‌پذیر** است تا تیم‌های تحقیق، ترید و ریسک بتوانند خروجی‌های قابل اتکا تولید کنند.

---

## 1) مبانی و تعاریف

* **Address vs. Entity (آدرس در برابر نهاد):** یک نهاد (Entity) ممکن است شامل چندین آدرس باشد؛ خوشه‌بندی (Clustering) از طریق هیوریستیک‌ها و داده‌های برچسبی انجام می‌شود و همواره **غیرقطعی** است.
* **UTXO vs. Account-based:** در UTXO ورودی/خروجی تراکنش‌ها صریح است و تغییر مالکیت در سطح UTXO رصد می‌شود؛ در Account-based توکن‌بالانس و انتقال‌ها (Logs/Transfers) محور تحلیل هستند.
* **Tagging/Labeling:** برچسب صرافی، نهنگ، نود ماینر، قرارداد هوشمند، خزانهٔ پروتکل و… با تلفیق منابع عمومی/تجاری/داخلی انجام می‌شود.
* **Custodial vs. Non-custodial:** رفتار جریان‌ها در کیف‌های کاستودیال (صرافی) با کیف‌های شخصی متفاوت است و باید تفکیک شود.

> **اصل شفافیت:** در تمامی خروجی‌ها **درصد عدم قطعیت**، **سیاست‌های خوشه‌بندی** و **پوشش برچسب‌ها** را اعلام کنید.

---

## 2) دامنهٔ داده و منابع

* **L1/L2 Coverage:** بیت‌کوین، اتریوم، و L2ها (Arbitrum/OP/Base) + زنجیره‌های EVM دیگر.
* **جداول پایه (مثال):**

  * `blocks`, `transactions`, `traces`, `logs`, `token_transfers` (ERC-20/721/1155)
  * `addresses`, `entities`, `entity_labels`، `exchange_wallets`, `contracts`
  * **Price & Market Data:** `ohlcv`, `funding_rates`, `open_interest`
* **کیفیت داده:** تاخیر (latency)، نرخ فوت پرینت، قوانین Backfill، تطبیق Chain-reorg.

---

## 3) شاخص‌ها و KPIهای کلیدی

* **Inflow/Outflow بین خوشه‌ها:**

  * $ETH/Token$ ورودی/خروجی به/از: صرافی‌های متمرکز، خزانهٔ پروتکل‌ها، کیف‌های سرد/گرم، قراردادهای بریج.
* **Net Position Change (NPC):** تغییر خالص بالانس در سطح نهاد، در بازه‌های 1س/4س/1د/1ه/1م.
* **Dormancy / Revived Supply:** سن خروجی‌ها (UTXO age) یا **coin days destroyed**؛ فعال شدن کوین‌های قدیمی.
* **Whale Activity:** تراکنش‌های بالای آستانهٔ حجمی (مثلاً 1M USD+)، خوشه‌بندی بر مبنای برچسب‌ها.
* **Exchange Flows:** خالص جریان به صرافی‌ها (احتمال فشار فروش) و از صرافی‌ها (انباشت).
* **Token-specific KPIs:** جریان توکن‌ها به خزانه‌های DAO، قراردادهای استیکینگ، LPها، بریج‌ها.

> **نکته:** همواره KPIها را با **قیمت، حجم معاملات، Funding، Open Interest** تقاطع دهید تا سیگنال تقویت یا رد شود.

---

## 4) متدولوژی استاندارد تحلیل

1. **تعریف پرسش تحلیلی:** (نمونه) «آیا نهنگ‌ها پیش از رویداد X انباشت کرده‌اند؟»
2. **انتخاب دامنهٔ زمانی و آستانه‌ها:** (UTC دقیق؛ Window و Step مشخص)
3. **استخراج اولیه داده:** انتقال‌های خالص بین خوشه‌ها/نهادها.
4. **پاکسازی و خطاسنجی:** حذف تراکنش‌های داخلی صرافی، قراردادهای سبدگردانی، مینت/برن، Airdropها.
5. **نرمال‌سازی:** بر حسب USD، Log-scale، یا تقسیم بر **MCAP/FDV** جهت مقایسهٔ بین‌دارایی.
6. **تقاطع با بازار:** چک همبستگی با قیمت/حجم/مشتقات.
7. **ساخت روایت (Narrative):** با بیان عدم قطعیت و محدودیت‌ها.

---

## 5) ضدالگوها، محدودیت‌ها و Red Flags

* **جابجایی داخلی صرافی‌ها** ≠ ورود/خروج واقعی کاربران.
* **Multisig/Contract Patterns:** تجمیع/بازتوزیع می‌تواند جریان کاذب بسازد.
* **Bridges & Wrappers:** انتقال بین‌زنجیره‌ای/توکن‌های رَپ‌شده برداشت غلط ایجاد می‌کند.
* **Label Drift:** برچسب‌ها به‌مرور تغییر می‌کنند (ادغام صرافی‌ها، مهاجرت کیف‌ها، تغییر مالکیت).
* **Heuristic Bias:** هیوریستیک‌های خوشه‌بندی (مانند common-input) عمومی‌سازی نشوند.

---

## 6) کوئری‌های نمونه (SQL/Pseudo)

### 6.1) خالص جریان به صرافی‌ها (اتریوم ERC-20)

```sql
WITH xfers AS (
  SELECT
    date_trunc('hour', block_time) AS ts,
    to_entity AS dst_entity,
    from_entity AS src_entity,
    symbol,
    SUM(amount) AS amt
  FROM token_transfers_enriched
  WHERE block_time BETWEEN :t0 AND :t1
    AND symbol = :symbol
  GROUP BY 1,2,3,4
)
SELECT ts,
  SUM(CASE WHEN dst_entity IN (:cex_list) THEN amt ELSE 0 END)
  - SUM(CASE WHEN src_entity IN (:cex_list) THEN amt ELSE 0 END) AS net_to_cex
FROM xfers
GROUP BY 1
ORDER BY 1;
```

### 6.2) Dormancy (BTC UTXO)

```sql
SELECT
  date_trunc('day', spend_time) AS d,
  SUM(value_btc * EXTRACT(EPOCH FROM (spend_time - create_time)) / 86400) AS coin_days_destroyed
FROM utxo_lifecycle
WHERE spend_time BETWEEN :t0 AND :t1
GROUP BY 1
ORDER BY 1;
```

### 6.3) Net Position Change برای یک نهاد

```sql
SELECT ts,
  SUM(inflow_usd) - SUM(outflow_usd) AS npc
FROM entity_balance_changes
WHERE entity_id = :eid AND ts BETWEEN :t0 AND :t1
GROUP BY 1
ORDER BY 1;
```

---

## 7) پایتون — پایپ‌لاین مرجع (Pseudo/Prod-ready)

```python
from datetime import datetime, timedelta
import pandas as pd

class WalletFlows:
    def __init__(self, src):
        self.src = src  # db/session

    def net_flow(self, entities, symbol, t0, t1, freq='1H'):
        q = """
        SELECT block_time AS ts, from_entity, to_entity, amount
        FROM token_transfers_enriched
        WHERE block_time BETWEEN :t0 AND :t1 AND symbol = :symbol
        """
        df = self.src.read_sql(q, params=dict(t0=t0, t1=t1, symbol=symbol))
        df['dir'] = df.apply(lambda r: 1 if r['to_entity'] in entities else (-1 if r['from_entity'] in entities else 0), axis=1)
        df['net'] = df['amount'] * df['dir']
        out = (df.set_index('ts')['net']
                 .resample(freq).sum().fillna(0)
                 .to_frame('net_flow'))
        return out

    def npc(self, entity_id, t0, t1, freq='1D'):
        q = "SELECT ts, inflow_usd, outflow_usd FROM entity_balance_changes WHERE entity_id=:eid AND ts BETWEEN :t0 AND :t1"
        df = self.src.read_sql(q, params=dict(eid=entity_id, t0=t0, t1=t1))
        df['npc'] = df['inflow_usd'] - df['outflow_usd']
        return (df.set_index('ts')['npc'].resample(freq).sum().fillna(0).to_frame('npc'))
```

---

## 8) آستانه‌ها و تشخیص رویداد

* **Thresholds:**

  * Net-to-CEX بالاتر از **p95** تاریخی → احتمال فشار فروش.
  * Dormancy Spike بالاتر از **z-score ≥ 2** → فعال‌سازی کوین‌های قدیمی.
  * Whale Transfers بالاتر از **USD 1M** در Window کوتاه → هشدار نقدشوندگی.
* **Event Fusion:** ترکیب سیگنال‌های جریان با **اخبار/رویداد آن‌چین** (ارتقاها، آنلاک‌ها، Proposalها).

---

## 9) گزارش‌دهی و داشبورد

* **Template گزارش:**

  * خلاصهٔ اجرایی (TL;DR)
  * وضعیت خالص جریان‌ها (روز/هفته)
  * بزرگ‌ترین جابجایی‌ها (Top 10)
  * جریان صرافی‌ها و نهنگ‌ها
  * Dormancy و CDD
  * تقاطع با قیمت/حجم/مشتقات
  * محدودیت‌ها و عدم قطعیت
* **Dashboard KPIs:**

  * Net Flow به/از CEX (USD)، NPC نهادهای کلیدی، Dormancy، Whale Count
  * Drill-down بر اساس دارایی/زنجیره/نهاد

---

## 10) کنترل کیفیت و ممیزی

* **Sampling & Traceback:** روی نمونه‌های بزرگ، ردیابی تراکنش تا سطح TX/Log/UTXO.
* **Cross-Source Validation:** تطبیق با چند منبع دیتا (Node + Indexer + Provider).
* **Label QA:** بازبینی دوره‌ای برچسب‌ها، پایش Drift، نسخه‌بندی (Label Versioning).
* **Reproducibility:** کد و کوئری‌ها را با **Hash و Snapshot** نسخه‌بندی کنید.

---

## 11) ضمیمه: چک‌لیست اجرا

* پوشش داده و تاخیر ingestion
* تعریف دقیق Window و Timezone
* لیست برچسب‌ها و منبع آن‌ها
* آستانهٔ معناداری آماری
* تقاطع با قیمت/مشتقات
* اعلام محدودیت‌ها/عدم قطعیت

---

## 12) واژه‌نامهٔ کوتاه

* **CDD:** Coin Days Destroyed؛ سن‌سنجی خرج‌ شدن کوین‌ها.
* **NPC:** Net Position Change؛ تغییر خالص موجودی یک نهاد.
* **Dormancy:** میانگین زمان خواب دارایی پیش از خرج‌شدن.
* **Whale:** خوشه/نهاد با ارزش دارایی بالا و تاثیرگذار.

> این سند یک پایهٔ **Production-Grade** برای تحلیل جریان کیف‌پول‌هاست و می‌تواند مستقیماً به صورت Playbook تیم داده/ریسک/ترید استفاده شود.

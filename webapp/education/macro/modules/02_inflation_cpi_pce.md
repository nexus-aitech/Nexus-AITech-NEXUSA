# ماژول کلان: تورم (CPI/PCE) و اثر آن بر کریپتو — چارچوب نهادی (v1.0)

> هدف: چارچوبی کمی، عملیاتی و قابل‌ممیزی برای پایش/پیش‌بینی تورم (CPI, Core CPI, PCE, Core PCE, Trimmed-Mean/Median) و ترجمه‌ی آن به سیگنال‌های قابل‌استفاده برای BTC/ETH. آماده‌ی لانچ عمومی.

---

## 0) دامنه، مفروضات و خروجی‌ها

* **دامنه**: شاخص‌های تورم آمریکا (CPI/PCE) + همتایان جهانی (HICP/EU, CPIH/UK, CPIF/SE).
* **مفروضات**: دسترسی به داده‌های رسمی ماهانه + اجماع پیش‌بینی (Consensus) برای محاسبه‌ی «سورپرایز».
* **خروجی‌ها**:

  1. **Inflation Surprise Score (ISS)** و **Inflation Momentum Index (IMI)**.
  2. **Crypto Inflation Sensitivity (CIS)** برای BTC/ETH و نگاشت به **Headwind/Tailwind**.
  3. **Event Study Template** برای روزهای اعلام.
  4. داشبورد KPI و آستانه‌های عملیاتی.

---

## 1) تفاوت‌های روش‌شناختی (CPI vs PCE)

* **CPI** (لاسپیرز ثابت): وزن‌ها مبتنی بر سبد خانوار؛ وزن **مسکن (Shelter, OER)** بالا؛ مبتنی بر قیمت‌های مصرف‌کننده.
* **PCE** (Chain-Weighted Fisher): پوشش وسیع‌تر (مصرف خانوار + پرداخت‌های اشخاص ثالث مانند بیمه/دولت)، وزن **سلامت** بالاتر، حساسیت بیشتر به جانشینی.
* **Core**: حذف غذا/انرژی (نوسانی).
* **Trimmed-Mean PCE** (دالاس) و **Median CPI** (کلیولند): مقاوم به برون‌زدگی‌ها.

**نکته**: فدرال‌رزرو هدف ۲٪ را بر مبنای **PCE** تعریف می‌کند (معیار ترجیحی سیاستگذار).

---

## 2) متغیرها و ساخت‌ها

* **YoY, MoM, MoM annualized**:
  $MoM_{ann} = (1+MoM)^{12} - 1$
* **Supercore Services**: خدمات هسته بدون مسکن؛ نماینده چسبندگی دستمزد/خدمت.
* **Shelter Split**: OER vs. Rent of Primary Residence.
* **Diffs & Gaps**: شکاف CPI↔Core، PCE↔Core، CPI↔PCE.

---

## 3) شاخص سورپرایز و مومنتوم

### 3.1 Inflation Surprise Score (ISS)

$\text{ISS} = w_1 z(\Delta\text{CPI}_\text{headline} - \hat{\Delta}\text{CPI}) + w_2 z(\Delta\text{Core CPI} - \hat{\Delta}\text{Core CPI}) + w_3 z(\Delta\text{Core PCE} - \hat{\Delta}\text{Core PCE})$

* z-score بر اساس توزیع خطای 24–36 ماه اخیر؛ وزن‌ها با بک‌تست تعیین می‌شوند.
* علامت مثبت = **تورم بالاتر از انتظار** (hawkish)، منفی = **کمتر از انتظار** (dovish).

### 3.2 Inflation Momentum Index (IMI)

$\text{IMI} = v_1 z(MoM_{ann}^{Core}) + v_2 z(Trimmed\text{-}Mean\ PCE) + v_3 z(Median\ CPI)$

* مومنتوم زیربخش‌های چسبنده را هم‌سنگ می‌کند.

---

## 4) حساسیت کریپتو (CIS) و نگاشت به سیگنال

### 4.1 Crypto Inflation Sensitivity (CIS)

* رگرسیون غلتان 24ماهه روی بازده‌های روزانه
  $r_{t}^{BTC/ETH} = \alpha + \beta_1 ISS_t + \beta_2 \Delta r^{real}_t + \beta_3 \Delta DXY_t + \epsilon_t$
* **CIS = $\beta_1$**: حساسیت شرطی به سورپرایز تورمی.

### 4.2 Headwind/Tailwind Mapping

* اگر **ISS>0** و **CIS<0** → **Headwind** (کاهش ریسک).
* اگر **ISS<0** و **CIS<0** → **Tailwind** (افزایش ریسک در محدوده‌های تعریف‌شده).
* با ترکیب **IMI** برای فازهای رونددار تورم (چسبندگی/کاهش پایدار).

---

## 5) Event Study استاندارد

* **رویدادها**: انتشار **CPI** (ماهانه)، **PCE** (ماهانه).
* **پنجره**: \[-1, 0, +1, +3, +5] روز معاملاتی.
* **خروجی**: CAR، توزیع واکنش، سهم متغیرهای کلان در حرکت قیمت (Attribution).
* **پس‌پردازش**: خوشه‌بندی رویدادها بر اساس اندازه سورپرایز و وضعیت بازار (Risk-on/Off).

---

## 6) پایپ‌لاین داده و مهندسی ویژگی

* **Sources**: BLS/BEA/FRED، اجماع پیش‌بینی (Vendor)، شاخص‌های جایگزین (used cars, rents, commodities).
* **Storage**: جداول `inflation_releases`, `consensus`, `core_components`, `alt_proxies`.
* **Feature Engine**: محاسبه ISS/IMI، شکاف‌ها، مومنتوم‌های سالانه.
* **Signal Engine**: تریگرهای ISS/IMI، سیگنال‌های رویدادی.
* **Backtesting**: تخصیص ریسک پویا با قیود اهرم و Circuit Breakers.
* **LLM Reporting**: «Inflation Watch» هفتگی/ماهانه.

---

## 7) داشبورد KPI و آستانه‌ها

* **Core PCE MoM (ann.)**, **Trimmed-Mean PCE**, **Median CPI**, **Supercore Services**, **Shelter**.
* **تریگر نمونه**:

  * اگر Core PCE MoM(ann.) > 3.5% و ISS>+0.5σ → Headwind.
  * اگر Median CPI < 2.2% و ISS<−0.5σ → Tailwind.
* **Alerting**: اعلان روز اعلام + سناریوهای ازپیش‌ساخته.

---

## 8) سناریوها و آزمون‌های تنش

* **Sticky Upside**: خدمات چسبنده بالا می‌ماند؛ نرخ واقعی↑؛ ریسک دارایی‌های پرریسک ↑.
* **Disinflation Glide**: کاهش تدریجی Core؛ تقویت ریسک‌پذیری.
* **Energy Shock**: جهش انرژی → انفصال Core/Headline؛ اعتبارسنجی با Trimmed-Mean.

---

## 9) کیفیت مدل و ممیزی

* **Walk-forward**، **Purged K-Fold**، تست پایداری وزن‌ها.
* **Explainability**: سهم هر جزء (Core/Trimmed/Median) در ISS/IMI.
* **Monitoring**: درجا‌به‌جایی رژیم‌ها (Markov Switching) و بروزرسانی CIS.

---

## 10) همتایان جهانی و بومی‌سازی

* **EU/HICP (Core)**، **UK/CPIH**، **SE/CPIF**: نگاشت به ISS/IMI با وزن‌های محلی.
* همگام‌سازی منطقه‌ای برای پرتفوی‌های چندارزی.

---

## 11) آماده‌سازی برای لانچ عمومی

* **Docs**: راهنمای کاربر، FAQ، مثال‌های تصویری.
* **افشا**: آموزشی بودن، نه سیگنال سرمایه‌گذاری؛ ریسک خطای داده/مدل.
* **i18n**: FA/EN؛ **دسترس‌پذیری** نمودارها.
* **نسخه‌بندی** و **Change Log**؛ تست بار داشبورد.
* **حاکمیت محتوا**: فرآیند بازبینی و پیگیری ایرادات.

---

## 12) چک‌لیست عملیاتی (فوق‌فشرده)

1. ingestion خودکار داده‌ها و اجماع.
2. محاسبه‌ی ISS/IMI و به‌روزرسانی CIS.
3. Event Study در روز اعلام + گزارش یک‌صفحه‌ای.
4. داشبورد KPI با آستانه‌های رنگی.
5. بک‌تست قابل‌تکرار و ممیزی‌پذیر.
6. سلب‌مسئولیت و استانداردهای انتشار عمومی.

---

## 13) پیوست‌ها

* فرمول‌های دقیق ISS/IMI و نگاشت به Head/Tailwind.
* الگوی دیتابیس برای `inflation_*`.
* شبه‌کد Event Study و به‌روزرسانی CIS.
* واژه‌نامه.

> نسخه: v1.0 — پیشنهاد بازبینی هر ۳–۶ ماه بر اساس داده‌های جدید و بازخورد کاربران.

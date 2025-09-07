# دوره پیشرفته اقتصاد کلان و ارتباط آن با کریپتو (Global Institutional Standard)

> این ماژول آموزشی در پلتفرم **NEXUSA** برای تحلیل نهادی اثر متغیرهای کلان بر چرخه‌های بازار کریپتو طراحی شده است. خروجی فقط تئوری نیست؛ شامل **شاخص‌های کمی، مدل‌های اقتصادسنجی، نوت‌بوک‌های محاسباتی و گزارش‌های عمومی** است. آماده برای لانچ جهانی.

---

## اهداف کلان

* تعریف و استانداردسازی **چهار ستون کلان** مرتبط با کریپتو:

  1. **نرخ بهره و منحنی بازده** (Interest Rates & Yield Curve).
  2. **تورم (CPI/PCE و همتایان جهانی)** (Inflation Metrics).
  3. **نقدینگی جهانی (M2/ترازنامه بانک‌های مرکزی)** (Global Liquidity).
  4. **قدرت دلار (DXY)** (Dollar Strength).
* ساخت شاخص‌های ترکیبی: **MHTI, ISS, IMI, CIS, GLI, DPI, MLTS**.
* فراهم‌کردن پایگاه داده نهادی (FRED, IMF, BIS, WorldBank, CBs).
* اجرای بک‌تست‌های نهادی (VAR, Markov Regime Switching, Event Study).
* آماده‌سازی برای اتصال به **Signal Engine** و **LLM Reporting**.

---

## پیش‌نیازها

* دانش متوسط اقتصاد کلان، بازار اوراق و کریپتو.
* توانایی کار با Python و Jupyter.
* آشنایی با اقتصادسنجی پایه (VAR، رگرسیون، Cointegration).
* نگاه داده‌محور و منتقدانه.

---

## ساختار پوشه‌ها

```
education/
  macro/
    README.md
    modules/
      01_interest_rates.md        # نرخ بهره و اثر آن بر BTC/ETH
      02_inflation_cpi_pce.md     # تورم (CPI/PCE) و اثر آن بر کریپتو
      03_liquidity_m2_dxy.md      # نقدینگی جهانی و شاخص دلار
    datasets/
      macro_indicators.yaml       # منابع داده کلان (FRED, IMF, CBs)
    notebooks/
      macro_backtest.ipynb        # بک‌تست نهادی و تحلیل رویداد
```

---

## نقشه راه یادگیری

1. مطالعه‌ی `01_interest_rates.md` → ساخت **MHTI (Macro Headwind/Tailwind Index)**.
2. مطالعه‌ی `02_inflation_cpi_pce.md` → محاسبه‌ی **ISS/IMI/CIS** و تحلیل Event Study روز اعلام.
3. مطالعه‌ی `03_liquidity_m2_dxy.md` → ترکیب **GLI, DPI, MLTS** و نگاشت به Tailwind/Headwind.
4. اجرای `macro_backtest.ipynb` → تست استراتژی‌های ریسک‌پایه.
5. اتصال خروجی‌ها به داشبورد KPI و **گزارش نهادی (One-Pager)**.

---

## خروجی‌های مورد انتظار

* شاخص‌های ترکیبی (MHTI, ISS, IMI, CIS, GLI, DPI, MLTS).
* گزارش‌های عمومی: «Macro State» و «Liquidity & Dollar Watch».
* بک‌تست‌های بازتولیدپذیر و ممیزی‌پذیر.
* امتیازدهی Headwind/Neutral/Tailwind برای BTC/ETH.
* چارچوب اتصال مستقیم داده‌های کلان به Signal Engine پلتفرم NEXUSA.

---

## روش امتیازدهی و سیگنال‌ها

* **MHTI**: وضعیت کلان نرخ بهره و سیاست پولی.
* **ISS/IMI**: سورپرایز و مومنتوم تورم.
* **CIS**: حساسیت شرطی BTC/ETH به تورم.
* **GLI/DPI/MLTS**: ترکیب نقدینگی و دلار.

> نگاشت نهایی: Headwind (<40)، Neutral (40–60)، Tailwind (>60).

---

## آماده‌سازی برای لانچ عمومی

* **Docs & FAQ** چندزبانه (FA/EN).
* **One-Pager Reports** با نمودار و رنگ‌بندی (MHTI/ISS/GLI/DPI/MLTS).
* **i18n & Accessibility**: نمودارهای خوانا، رنگ‌های کنتراست‌دار.
* **Versioning**: Semantic (v1.0.0) + Change Log.
* **Governance**: فرآیند بازبینی ۳ماهه و پاسخگویی به ایرادات کاربران.
* **سلب مسئولیت**: آموزشی بودن، عدم ارائه سیگنال خرید/فروش.

---

## هشدار

این ماژول صرفاً آموزشی است. هیچ توصیه سرمایه‌گذاری یا سیگنال معاملاتی ارائه نمی‌دهد. مسئولیت تصمیم‌ها با کاربر است.

---

> نسخه: v1.0 — بازبینی هر ۳–۶ ماه بر اساس تغییرات اقتصاد جهانی و بازخورد کاربران.

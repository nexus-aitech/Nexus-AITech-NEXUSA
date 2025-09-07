# چارچوب پیشرفته کاربرد واقعی و مدل‌های ارزش‌گذاری (Global Institutional Standard)

> هدف: اتصال مستقیم «کاربرد واقعی» به «ارزش‌گذاری توکن» با استفاده از مدل‌های کمی، سناریوسازی و متدولوژی‌های نهادی. این چارچوب استانداردی برای تحلیلگران نهادی، VCها و DAOها است.

---

## 0) دامنه و خروجی‌ها

* **دامنه**: پروتکل‌های DeFi (Lending, DEX, Derivatives)، L1/L2، RWA، Stablecoins، Middleware/Infra.
* **خروجی‌ها**: ارزش منصفانه‌ی توکن، نسبت‌های کلیدی، ماتریس ریسک-کاربرد، گزارش Due Diligence.

---

## 1) اتصال کاربرد به جریان ارزش

* **Revenue Mapping**: درآمد پروتکل → تخصیص به توکن‌داران (Fee Share, Buyback & Burn, Staking Yield).
* **Structural Demand**: نیاز بنیادین به توکن (Gas, Collateral, Security Bond, Work Token).
* **Value Capture Efficiency (VCE)**:
  $VCE = \frac{Tokenholder\ Revenue}{Protocol\ Revenue}$

---

## 2) دسته‌بندی کاربردها (Taxonomy)

1. **Lending/Borrowing**: نرخ بهره خالص (Net Interest Margin)، Utilization، ریسک نکول.
2. **DEX/AMM**: حجم معاملات، نرخ کارمزد، سهم بازار، MEV Capture.
3. **Derivatives**: کارمزد باز/بسته، Funding Rates.
4. **Infra (L1/L2/Oracle)**: Gas Fees، امنیت، درآمد MEV، Sequencer Revenue.
5. **RWA/Stablecoins**: ذخایر، درآمد بهره، پوشش قانونی، ریسک بانکداری سایه.
6. **Middleware/Services**: API Calls، Subscription، Usage-based Fees.

---

## 3) متریک‌ها و نسبت‌ها

* **Protocol Revenue / Fees** (کل درآمد).
* **Tokenholder Revenue** (سهم تخصیص‌یافته).
* **VCE (Value Capture Efficiency)**.
* **TVL، MC/TVL، P/F (Price to Fees)، EV/Revenue**.
* **User Metrics**: MAU/DAU، Cohort Retention، LTV/CAC.
* **Unit Economics**: Gross Margin، Contribution Margin.

---

## 4) مدل‌های ارزش‌گذاری پیشرفته

### 4.1 جریان نقدی تنزیل‌شده (DCF)

1. پیش‌بینی رشد کاربران/حجم/TVL.
2. مدل درآمد → تخصیص به توکن.
3. نرخ تنزیل پویا (r): r = r\_f + β\_mkt + β\_reg + β\_liq.
4. ارزش منصفانه = ∑ (FCF\_to\_Token / (1+r)^t).

### 4.2 نسبی‌سنجی (Multiples)

* مقایسه با هم‌رده‌ها: P/F، EV/Revenue، MC/TVL.
* استفاده از **Peer Group Adjusted Multiples** با کنترل اندازه و مرحله.

### 4.3 مدل توکن کار (Work Token)

* فرمول: تقاضا × قیمت خدمت × سهم به توکن.
* مثال: Oracle Requests × Fee × % Allocation.

### 4.4 مدل MV=PQ تطبیقی

* $M$ = ECS (Effective Circulating Supply).
* $V$ = Velocity، کنترل‌شده توسط Sinkها.
* $PQ$ = ارزش مصرف شبکه.

### 4.5 مدل Real Options

* ارزش‌گذاری حق انتخاب: قابلیت مقیاس‌پذیری، توسعه ماژول‌های جدید.
* روش: Black-Scholes یا Binomial Trees برای ارزش‌گذاری «حق توسعه».

---

## 5) سناریوسازی و شبیه‌سازی

* **Monte Carlo Simulation** روی متغیرهای: Volume، Fee Rate، Allocation، Velocity.
* **Stress Test**: کاهش ۵۰% TVL، افت ۷۰% Volume، شوک رگولاتوری.
* **Sensitivity Analysis**: ΔValue / Δ(Allocation %, Fees, Velocity).

---

## 6) ماتریس ریسک-کاربرد

ابعاد:

* **پایداری درآمد**: تکرارشونده vs. یک‌باره.
* **رقابت**: شدت رقابت و موانع ورود.
* **وابستگی به رگولاتوری**.
* **Elasticity of Demand**: حساسیت کاربران به تغییر قیمت/کارمزد.

امتیازدهی ۱–۵ در هر بُعد → ماتریس ۴×۴ ریسک/بازده.

---

## 7) امتیازدهی جهانی (۰–۱۰۰۰)

### ابعاد نمونه

* شفافیت جریان درآمد (۰–۱۵۰)
* نسبت درآمد منتسب به توکن (VCE) (۰–۱۵۰)
* پایداری کاربرد و تقاضا (۰–۱۵۰)
* رقابت و مزیت پایدار (۰–۱۲۰)
* حساسیت به رگولاتوری (۰–۱۰۰)
* کیفیت داده و قابلیت اندازه‌گیری (۰–۱۲۰)
* کارایی مدل ارزش‌گذاری (۰–۱۱۰)
* قابلیت مقیاس‌پذیری و Real Options (۰–۱۰۰)

### رتبه‌بندی

* 900–1000: نخبه (Institutional-Grade)
* 750–899: پیشرفته
* 600–749: قابل‌قبول
* <600: پرریسک / مشکوک به failure در value capture

---

## 8) قالب Due Diligence پیشرفته

1. جریان‌های درآمدی شناسایی‌شده + نقشه تخصیص.
2. نسبت VCE + نسبت‌های مالی کلیدی.
3. سناریوسازی DCF + Monte Carlo.
4. مقایسه Multiples با Peer Group.
5. ماتریس ریسک-کاربرد.
6. گزارش حساسیت (Drivers of Value).

---

## 9) داشبورد KPI

* **Revenue Dashboard**: Protocol vs. Tokenholder Revenue.
* **Efficiency Dashboard**: VCE، APR\_real.
* **Market Metrics**: MC/TVL، P/F، EV/Revenue.
* **User Metrics**: MAU/DAU، LTV/CAC.
* **Risk Dashboard**: Regulatory Index، Unlock Risk، Competition Index.

---

## 10) چک‌لیست ممیزی نهایی

1. آیا جریان درآمد شفاف و پایدار است؟
2. آیا توکن واقعاً سهمی از درآمد می‌گیرد؟
3. آیا مدل ارزش‌گذاری کمی و تست‌شده است؟
4. آیا پروژه مزیت رقابتی پایدار دارد؟
5. آیا اثر رگولاتوری و ریسک‌های بیرونی سنجیده شده‌اند؟
6. آیا سناریوسازی و استرس‌تست انجام شده است؟
7. آیا داده‌ها قابل‌اندازه‌گیری و شفاف‌اند؟

---

## 11) پیوست‌ها

* الگوی گزارش ارزش‌گذاری (Valuation Memo).
* نمونه Monte Carlo Code Snippet.
* Benchmarks نسبت‌های مالی جهانی.
* واژه‌نامه.

> نسخه: v1.0 — بازنگری هر ۶–۱۲ ماه.

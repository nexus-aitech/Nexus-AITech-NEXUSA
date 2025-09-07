# NEXUSA (Enterprise Build — مطابق معماری)
این نسخه بر اساس معماری ارسالی شما پیاده‌سازی شده و شامل لایه‌های **Ingestion → Broker → Feature → Signal → Backtesting → Reporting → Serving/Orchestration** است.

## Overview
NEXUSA یک اسکلت تمیز و ماژولار برای سیستم‌های معاملاتی و آموزشی است که شامل:
- معماری Microservices + Event-driven (Kafka/NATS)
- FastAPI برای API
- RAG Tutor با citation اجباری و Fact-check عددی
- Adaptive Learning (BKT/DKT)
- Telemetry (xAPI-like) + KPI  
می‌باشد. این ریپو صرفاً یک اسکلت اولیه است و سرویس‌ها باید با منطق دامنه پر شوند.

## TL;DR – اجرای سریع محلی
```bash
# 1) وابستگی‌ها
python -m venv .venv && source .venv/bin/activate  # ویندوز: .venv\Scripts\activate
pip install -r requirements.txt

# 2) سرویس‌های اصلی (Kafka, ClickHouse, MinIO, Redis)
docker compose up -d

# 3) تنظیمات
cp .env.example .env   # کلیدها و تنظیمات را پر کنید

# 4) اجرای جریان نمونه (REST → Kafka → Feature → Signal → Backtest)
python runner.py --mode batch --exchange __EXCHANGE_NAME__ --symbol BTC/USDT --tf 1h --limit 500
# اجرای استریم (WebSocket → Kafka)
python websocket_streamer.py --symbol btcusdt --channel kline_1m --exchange __EXCHANGE_NAME__
```

## Setup
1. مخزن را کلون کنید.  
2. محیط مجازی بسازید و وابستگی‌ها را نصب کنید.  
3. سرویس‌های اصلی را با `docker-compose` بالا بیاورید.  
4. فایل `.env` را از روی `.env.example` بسازید و مقادیر واقعی را تنظیم کنید.  

## Configuration
- متغیرهای محیطی در `.env.example` مشخص شده‌اند.  
- سرویس‌ها (Kafka, MinIO, ClickHouse, Redis) در `docker-compose.yaml` تعریف شده‌اند.  
- می‌توانید پورت‌ها، دیتابیس و تنظیمات امنیتی را سفارشی کنید.  

## Security
- احراز هویت با OAuth2/OIDC و RBAC طراحی شده است.  
- برای Production باید از Secret Manager به جای فایل `.env` استفاده شود.  
- در محیط واقعی DEBUG=False الزامی است.  

## Modules
- **Ingestion**: `rest_fetcher.py`, `websocket_streamer.py`, `kafka_producer.py`
- **Schema & Contracts**: `schema_registry.py`, `schema_guard.py`, `feature_schema.py`, `signal_schema.py`, `contract_tester.py`
- **Features**: `feature_engine.py`, اندیکاتورها: `adx.py`, `atr.py`, `vwap.py`, (اضافه‌پذیر: Ichimoku, OBV, StochRSI)
- **Signals**: `rule_engine.py`, `ml_model.py`, `final_scorer.py`, `signal_emitter.py`
- **Storage**: `tsdb_writer.py` (ClickHouse/Timescale)، `s3_archiver.py` (MinIO/S3), `feature_store.py`
- **Observability**: `telemetry.py`, `observability.py`, `slo_gatekeeper.py`
- **Serving**: `fastapi_server.py` (REST/WS + Prometheus metrics)
- **Orchestration**: `orchestrator.py` (Prefect-ready DAG)، `data_flow.py`, `state_manager.py`
- **Utility**: `config.py`, `config_hashing.py`, `time_utils.py`, `service_mesh_hooks.py`

## معماری
- Microservices + Event-driven (Kafka/NATS)
- FastAPI (REST), OAuth2/OIDC + RBAC
- RAG Tutor با citation اجباری، Fact-check عددی
- Adaptive Learning (BKT/DKT)
- Telemetry (xAPI-like) + KPI

### محدودیت‌های این تحویل
- وابستگی‌های زیر به‌صورت Placeholder پیاده‌سازی شده‌اند: Kafka/NATS، VectorDB، ClickHouse/Timescale، OIDC واقعی، K8s Operator واقعی.
- برای Production لازم است این وابستگی‌ها جایگزین نسخه‌های واقعی شوند.

## قرارداد‌ها (Schemas)
- پیام خام/ویژه/سیگنال مطابق PDF با نسخه‌گذاری اسکیمایی و اعتبارسنجی JSONSchema.
- ترکیب Rule+ML برای **FinalScore = 0.6 * RuleScore + 0.4 * ML_Prob_To_TP** و تصمیم Long/Short/Neutral.

## پذیرش
- **SLO Gate**: روی تأخیر و کیفیت داده، build را fail می‌کند.
- **DLQ**: پیام‌های معیوب به موضوع DLQ می‌روند.
- **Idempotency**: کلید پیام = hash(symbol, tf, ts_event).

## License
این پروژه تحت مجوز MIT منتشر شده است.

## API Specifications
- [GraphQL Notes](docs/graphql.md)
- [OpenAPI Endpoints](docs/openapi.md)

## API Specifications

### OpenAPI
هر سرویس FastAPI به‌صورت خودکار OpenAPI تولید می‌کند (مسیر `/openapi.json`).
- Content Service: `/content/...`
- Assessment Service: `/assessment/...`
- Tutor Service: `/tutor/...`
- Lab Service: `/lab/...`
- Recommender Service: `/recommender/...`
- Community Service: `/community/...`

### GraphQL
**یادداشت:** در این نسخه MVP، GraphQL به‌صورت Gateway اضافه نشده است.  
برای نسخه Advanced می‌توان از یک Gateway با [Strawberry](https://strawberry.rocks/) استفاده کرد که Query/Mutation های زیر را ارائه دهد:

- Queries: `me`, `modules`, `lesson(id)`, `recommendations(userId)`, `quiz(id)`, `tutorHistory(sessionId)`
- Mutations: `startTutor`, `chatTutor`, `submitAttempt`, `submitProject`

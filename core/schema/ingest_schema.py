"""
اسکیماهای Pydantic برای پیام‌های ورودی (ingestion) در NEXUSA.

این ماژول ساختار استاندارد داده‌های ورودی از اکسچنج‌ها را تعریف می‌کند
و با اعتبارسنجی‌های لازم (تایم‌فریم مجاز و سازگاری قیمت‌ها) از کیفیت داده
پیش از ورود به لایه‌های بعدی اطمینان می‌دهد.
"""

from pydantic import BaseModel, Field, validator, root_validator, conint, confloat
from typing import Optional, Literal, Dict, Any
from datetime import datetime

# ⏱ لیست تایم‌فریم‌های معتبر — تعریف‌شده برای ingestion pipeline
ALLOWED_TF = {
    "1m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "8h", "12h",
    "1d"
}


class OHLCV(BaseModel):
    """ساختار استاندارد داده‌های کندل"""
    open: confloat(ge=0)
    high: confloat(ge=0)
    low: confloat(ge=0)
    close: confloat(ge=0)
    volume: confloat(ge=0)


class Flows(BaseModel):
    """حجم سفارشات تفکیک‌شده توسط انواع شرکت‌کننده بازار"""
    taker_buy_vol: Optional[float] = None
    taker_sell_vol: Optional[float] = None
    maker_buy_vol: Optional[float] = None
    maker_sell_vol: Optional[float] = None


class IngestPayload(BaseModel):
    """داده ورودی خام از exchange برای پردازش در ingestion layer"""
    symbol: str = Field(..., example="BTCUSDT", description="نماد جفت‌ارز مثل BTCUSDT")
    exchange: str = Field(..., example="__EXCHANGE_NAME__", description="نام صرافی دریافت‌کننده دیتا")

    ts_event: conint(gt=0) = Field(..., description="زمان وقوع رویداد (Unix ts)")
    ingest_ts: conint(gt=0) = Field(..., description="زمان ingest شدن در سیستم (Unix ts)")

    tf: str = Field(..., description="تایم‌فریم داده‌ها (مثلاً 15m یا 1h)")

    ohlcv: OHLCV
    funding: Optional[float] = Field(None, description="نرخ funding در پریود داده")
    oi: Optional[float] = Field(None, description="Open Interest در این بازه")
    flows: Optional[Flows] = Field(None, description="اطلاعات سفارش‌گیری تفکیک‌شده")

    @validator("tf")
    def validate_timeframe(cls, v: str) -> str:
        """اعتبارسنجی تایم‌فریم دریافتی بر اساس ALLOWED_TF."""
        if v not in ALLOWED_TF:
            raise ValueError(f"Invalid timeframe: '{v}'. Allowed values are: {sorted(ALLOWED_TF)}")
        return v

    @root_validator
    def check_price_consistency(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """بررسی سازگاری قیمت‌ها: مقدار low نباید از high بزرگ‌تر باشد."""
        o = values.get("ohlcv")
        if o is not None:
            high, low = o.high, o.low
            if low > high:
                raise ValueError(f"Inconsistent OHLCV values: low > high ({low} > {high})")
        return values


class IngestMessage(BaseModel):
    """پیام نهایی قابل ارسال در سیستم‌های Kafka/Redpanda و ثبت در schema registry"""
    schema_version: Literal["v2"] = Field("v2", description="نسخه اسکیمای ورودی")
    data: IngestPayload

    class Config:
        """پیکربندی Pydantic به‌همراه مثال نمونه برای مستندسازی."""
        schema_extra = {
            "example": {
                "schema_version": "v2",
                "data": {
                    "symbol": "BTCUSDT",
                    "exchange": "__EXCHANGE_NAME__",
                    "ts_event": 1755196800,
                    "ingest_ts": 1755196810,
                    "tf": "15m",
                    "ohlcv": {
                        "open": 40100.5,
                        "high": 40350.0,
                        "low": 40080.0,
                        "close": 40210.0,
                        "volume": 358.6
                    },
                    "funding": 0.0001,
                    "oi": 1.23e9,
                    "flows": {
                        "taker_buy_vol": 150.0,
                        "taker_sell_vol": 130.0,
                        "maker_buy_vol": 50.0,
                        "maker_sell_vol": 28.0
                    }
                }
            }
        }

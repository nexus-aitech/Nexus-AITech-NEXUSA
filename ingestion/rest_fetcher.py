"""REST OHLCV Fetcher (ccxt, async).

وظیفه: دریافت OHLCV از صرافی‌ها (__EXCHANGE_NAME__ ها) با ccxt،
ساخت پیام نرمال‌شده و ارسال به Kafka.

اصلاحات این نسخه:
- افزودن داک‌استرینگ ماژول و توابع.
- افزودن Observability اختیاری (Prometheus/OpenTelemetry) در مسیر بحرانی.
- رفع LAYER_VIOLATION: حذف import از لایه‌های storage.* و reports.*؛
  به‌جای آن، اعتبارسنجی حداقلی داخل همین ماژول و register محلیِ بدون وابستگی.
- افزودن type hint بازگشتی برای run_batch.
- بهبود جزئی جایگزینی نماد برای کوین‌های با پسوند :USDT.
"""

from __future__ import annotations

import asyncio
import logging
import time
import ccxt.async_support as ccxt
from typing import Iterable, Dict, List, Optional
from core.kafka_producer import KafkaProducerWrapper as Producer



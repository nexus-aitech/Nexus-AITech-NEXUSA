"""Kafka consumer helpers for the NEXUSA platform.

Provides a thin factory to create a Confluent Kafka `Consumer` from settings.
If `confluent_kafka` در دسترس نباشد، برای سازگاری در محیط‌های dev/test مقدار `None` برمی‌گرداند.
"""

from __future__ import annotations

from typing import Optional, List

from .config import get_settings
try:
    from confluent_kafka import Consumer
except Exception:
    Consumer = None  # type: ignore


def get_consumer(group_id: str, topics: List[str]) -> Optional["Consumer"]:
    """Create and subscribe a Kafka Consumer using app settings.

    Args:
        group_id: Kafka consumer group id.
        topics: List of topic names to subscribe to.

    Returns:
        A configured `confluent_kafka.Consumer` if the library is available,
        otherwise `None` (برای اجرا در محیط‌هایی که Kafka یا کتابخانه نصب نیست).
    """
    s = get_settings()
    if not Consumer:
        return None
    c = Consumer({
        'bootstrap.servers': s.KAFKA_BOOTSTRAP,
        'group.id': group_id,
        'auto.offset.reset': 'earliest'
    })
    c.subscribe(topics)
    return c

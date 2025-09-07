"""Lightweight event bus wrapper for producing messages to Kafka.

Uses `confluent_kafka.Producer` when available; otherwise logs events so that
code paths remain runnable in dev/test without a Kafka broker.
"""  # :contentReference[oaicite:0]{index=0}

from .config import get_settings
from typing import Any
import json, logging

log = logging.getLogger(__name__)


class EventBus:
    """Thin Kafka publisher with safe no-op fallback."""

    def __init__(self) -> None:
        """Initialize producer from settings; fall back to logging if unavailable."""
        s = get_settings()
        self.kafka_bootstrap = s.KAFKA_BOOTSTRAP
        # Lazy import to avoid hard dependency if not used
        try:
            from confluent_kafka import Producer  # type: ignore
            self._producer = Producer({'bootstrap.servers': self.kafka_bootstrap})
        except Exception:
            self._producer = None

    def publish(self, topic: str, key: str, value: dict[str, Any]) -> None:
        """Publish a message to Kafka or log it if producer is unavailable.

        Args:
            topic: Kafka topic name.
            key: Message key (used for partitioning).
            value: JSON-serializable payload dictionary.
        """
        payload = json.dumps(value).encode("utf-8")
        if self._producer:
            self._producer.produce(topic, key=key, value=payload)
            self._producer.flush()
        log.info(f"PUBLISH topic={topic} key={key} value={value}")


bus = EventBus()

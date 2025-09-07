"""
Kafka producer utilities for NEXUSA.

Provides:
- `KafkaProducerWrapper`: high-level sync producer (Confluent Kafka) with idempotence,
  consistent partitioning via hashed keys, delivery latency metrics, and DLT publishing.
- `AsyncKafkaProducer`: asyncio-based producer (aiokafka) with simple send semantics.

Observability:
- Delivery latency observed via `observe_delivery_latency_ms`.
- Producer queue length tracked with `set_queue_len`.
- Message rate and drops tracked with `ui.telemetry.msg_rate` and `ui.telemetry.dropped_msgs`.

Notes:
- Confluent Kafka is optional at runtime; if unavailable, `KafkaProducerWrapper` raises at init.
- Keys are derived deterministically from (symbol, tf) to preserve partition affinity.
"""
# Source basis: :contentReference[oaicite:0]{index=0}

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any, Dict, Optional

from aiokafka import AIOKafkaProducer
from core.config.config import settings
from ui.telemetry import dropped_msgs, msg_rate

try:
    # Optional dependency; only required for KafkaProducerWrapper
    from confluent_kafka import KafkaError, Message, Producer as ConfluentProducer  # type: ignore
except Exception:  # pragma: no cover - optional dep at runtime
    ConfluentProducer = None  # type: ignore[assignment]
    KafkaError = Exception  # type: ignore[assignment]
    Message = Any  # type: ignore[misc]

from ingestion.metrics import observe_delivery_latency_ms, set_queue_len

log = logging.getLogger("nexusa.core.kafka_producer")
logging.basicConfig(level=logging.INFO)


def _hash_key(symbol: Optional[str], tf: Optional[str]) -> bytes:
    """
    Create a deterministic SHA-256 hash key from (symbol, tf).

    This key provides stable partitioning for messages that belong together.

    Args:
        symbol: Instrument symbol (e.g., "BTCUSDT"). If None, treated as empty.
        tf: Timeframe string (e.g., "1m"). If None, treated as empty.

    Returns:
        The 32-byte SHA-256 digest usable as a Kafka message key.
    """
    key = f"{symbol or ''}|{tf or ''}".encode("utf-8")
    return hashlib.sha256(key).digest()


class KafkaProducerWrapper:
    """
    High-level Kafka producer using Confluent Kafka with safe defaults.

    Features:
        - enable.idempotence=True
        - acks=all
        - lz4 compression
        - Consistent partitioning by (symbol, tf) using `_hash_key`.
        - Delivery callback with latency metric and message rate/drop counters.
        - Optional transactions when `transactional_id` is provided.
    """

    def __init__(
        self,
        bootstrap_servers: str,
        client_id: str = "nexusa-ingest-producer",
        transactional_id: Optional[str] = None,
        extra_config: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Initialize the producer.

        Args:
            bootstrap_servers: Kafka bootstrap servers string.
            client_id: Kafka client.id.
            transactional_id: If provided, enables transactions with this id.
            extra_config: Extra librdkafka configuration to merge into defaults.

        Raises:
            RuntimeError: If confluent_kafka is not available.
        """
        if ConfluentProducer is None:
            raise RuntimeError("confluent_kafka is required for KafkaProducerWrapper")

        base_conf: Dict[str, Any] = {
            "bootstrap.servers": bootstrap_servers,
            "client.id": client_id,
            "enable.idempotence": True,
            "acks": "all",
            "compression.type": "lz4",
            "queue.buffering.max.messages": 200_000,
            "message.send.max.retries": 10_000_000,
            "retry.backoff.ms": 100,
            "linger.ms": 5,
            "batch.num.messages": 10_000,
            "socket.keepalive.enable": True,
        }
        if transactional_id:
            base_conf["transactional.id"] = transactional_id
        if extra_config:
            base_conf.update(extra_config)

        self._producer = ConfluentProducer(base_conf)
        self._dlt_topic_suffix = ".DLT"

        if transactional_id:
            self._producer.init_transactions()

    def _on_delivery(self, err: Optional[KafkaError], msg: Optional[Message], send_ts_ns: int) -> None:
        """
        Delivery callback to record latency and failures.

        Args:
            err: KafkaError if delivery failed; otherwise None.
            msg: Delivered message (unused here, but kept for signature parity).
            send_ts_ns: Monotonic-ish timestamp (ns) taken just before produce().
        """
        if err is not None:
            try:
                dropped_msgs.labels(reason=str(err)).inc()
            except Exception:
                pass
            log.error("Delivery failed: %s", err)
            return

        latency_ms = (time.time_ns() - send_ts_ns) / 1e6
        try:
            observe_delivery_latency_ms(latency_ms)
            msg_rate.labels(topic=getattr(msg, "topic", lambda: "unknown")()).inc()  # type: ignore[attr-defined]
        except Exception:
            # Metrics are best-effort; never break delivery path
            pass

    def produce(
        self,
        topic: str,
        value: Dict[str, Any],
        key_fields: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timestamp_ms: Optional[int] = None,
    ) -> None:
        """
        Produce a JSON-encoded message to Kafka (synchronous API with async I/O under the hood).

        Args:
            topic: Kafka topic.
            value: Message payload (will be compact-JSON encoded to bytes).
            key_fields: Optional dict containing "symbol" and "tf" for key hashing.
            headers: Optional string headers to attach.
            timestamp_ms: Optional message timestamp in milliseconds since epoch.

        Notes:
            - Increments `msg_rate` on successful delivery via callback; on errors increments `dropped_msgs`.
            - Queue length gauge is updated opportunistically after `produce`.
        """
        symbol = (key_fields or {}).get("symbol")
        tf = (key_fields or {}).get("tf")
        key = _hash_key(symbol, tf)

        send_ts_ns = time.time_ns()
        try:
            self._producer.produce(
                topic=topic,
                key=key,
                value=json.dumps(value, separators=(",", ":")).encode("utf-8"),
                headers=[(k, str(v).encode("utf-8")) for k, v in (headers or {}).items()],
                timestamp=timestamp_ms,
                on_delivery=lambda err, msg: self._on_delivery(err, msg, send_ts_ns),
            )
        except Exception as e:
            # Count drops on immediate client-side errors
            try:
                dropped_msgs.labels(reason=str(e)).inc()
            except Exception:
                pass
            log.exception("Immediate produce failure to %s", topic)
            raise
        finally:
            self._poll_and_set_queue_len()

    def _poll_and_set_queue_len(self) -> None:
        """
        Service the delivery queue and opportunistically export current queue length.
        """
        self._producer.poll(0)
        try:
            qlen = self._producer.flush(0)  # returns int outstanding messages
        except TypeError:
            qlen = -1

        try:
            set_queue_len(qlen if isinstance(qlen, int) else -1)
        except Exception:
            set_queue_len(-1)

    def flush(self, timeout: float = 10.0) -> None:
        """
        Block until all outstanding messages are delivered or until timeout.

        Args:
            timeout: Maximum time (seconds) to wait.
        """
        self._producer.flush(timeout)

    def begin_transaction(self) -> None:
        """
        Begin a producer transaction. Requires `transactional_id` at init.
        """
        self._producer.begin_transaction()

    def commit_transaction(self) -> None:
        """
        Commit the current producer transaction.
        """
        self._producer.commit_transaction()

    def abort_transaction(self) -> None:
        """
        Abort the current producer transaction.
        """
        self._producer.abort_transaction()

    def produce_to_dlt(
        self,
        topic: str,
        raw_value: bytes,
        reason: str,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        """
        Publish raw bytes to the topic's Dead Letter Topic (DLT).

        Args:
            topic: Base topic (DLT suffix will be appended).
            raw_value: Raw message bytes to store for forensics.
            reason: Short description of why the message was dead-lettered.
            headers: Optional headers to forward/augment.
        """
        dlt_topic = topic + self._dlt_topic_suffix
        hdrs = {"dlt_reason": reason, **(headers or {})}
        self._producer.produce(
            topic=dlt_topic,
            key=None,
            value=raw_value,
            headers=[(k, str(v).encode("utf-8")) for k, v in hdrs.items()],
        )
        self._poll_and_set_queue_len()


def _key(symbol: str, tf: str, ts: int) -> bytes:
    """
    Build a stable, bytes-encoded key from (symbol, timeframe, timestamp).

    Args:
        symbol: Instrument symbol.
        tf: Timeframe string.
        ts: Timestamp (usually epoch seconds or ms).

    Returns:
        Bytes-encoded hex digest for use as Kafka key.
    """
    h = hashlib.sha256(f"{symbol}|{tf}|{ts}".encode()).hexdigest()
    return h.encode()


class AsyncKafkaProducer:
    """
    Async Kafka producer using aiokafka, suitable for non-blocking ingestion paths.
    """

    def __init__(self, bootstrap: str | None = None) -> None:
        """
        Create an async producer.

        Args:
            bootstrap: Kafka bootstrap servers; defaults to `settings.kafka.bootstrap`.
        """
        self.bootstrap = bootstrap or settings.kafka.bootstrap
        self._p: AIOKafkaProducer | None = None

    async def start(self) -> None:
        """
        Initialize and start the underlying aiokafka producer.
        """
        self._p = AIOKafkaProducer(
            bootstrap_servers=self.bootstrap,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
        await self._p.start()
        log.info("Kafka producer connected to %s", self.bootstrap)

    async def stop(self) -> None:
        """
        Stop the producer and release network resources.
        """
        if self._p:
            await self._p.stop()
            self._p = None

    async def send(self, topic: str, value: dict, key_fields: tuple[str, str, int] | None = None) -> None:
        """
        Send a single message and wait for broker acknowledgement.

        Args:
            topic: Kafka topic name.
            value: Dict payload; serialized to JSON.
            key_fields: Optional (symbol, tf, ts) tuple to derive the key.

        Raises:
            RuntimeError: If `start()` was not called.
            Exception: Any broker/client error encountered by aiokafka.
        """
        if not self._p:
            raise RuntimeError("Producer not started")
        try:
            key = _key(*key_fields) if key_fields else None
            await self._p.send_and_wait(topic, value=value, key=key)
            msg_rate.labels(topic=topic).inc()
        except Exception as e:
            dropped_msgs.labels(reason=str(e)).inc()
            log.exception("Failed to send message to %s", topic)
            raise

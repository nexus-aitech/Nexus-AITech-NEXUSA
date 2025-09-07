"""NEXUSA — Kafka consumer wrappers with manual-commit and asyncio variants.

This module provides:
- KafkaConsumerWrapper (Confluent Kafka): pull, JSON-decode, process, then commit on success
- AsyncKafkaConsumer (aiokafka): async iteration-friendly consumer

Observability:
- Prometheus counters/histograms instrument the critical paths (poll, process, commit, errors).
If `prometheus_client` is unavailable, metrics default to safe no-ops.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from types import TracebackType
from typing import (
    Any,
    AsyncIterator,
    Callable,
    Dict,
    Iterable,
    Optional,
    Protocol,
)

from aiokafka import AIOKafkaConsumer
from core.config.config import settings

# -------------------------------
# Observability (Prometheus-safe)
# -------------------------------
try:
    from prometheus_client import Counter, Histogram  # type: ignore

    KAFKA_POLL_TOTAL = Counter(
        "kafka_poll_total", "Number of poll() calls (including timeouts)", ["client"]
    )
    KAFKA_POLL_MSGS = Counter(
        "kafka_poll_messages_total", "Messages returned from poll()", ["client"]
    )
    KAFKA_POLL_ERRORS = Counter(
        "kafka_poll_errors_total", "Errors returned from poll()", ["client", "code"]
    )
    KAFKA_POLL_LATENCY = Histogram(
        "kafka_poll_latency_seconds", "Latency of poll() calls", ["client"]
    )

    KAFKA_JSON_DECODE_ERRORS = Counter(
        "kafka_json_decode_errors_total", "JSON decode failures", ["client"]
    )
    KAFKA_DLT_PUBLISH_TOTAL = Counter(
        "kafka_dlt_publish_total", "Messages published to DLT", ["client", "reason"]
    )
    KAFKA_DLT_PUBLISH_ERRORS = Counter(
        "kafka_dlt_publish_errors_total", "Errors when publishing to DLT", ["client"]
    )

    KAFKA_PROCESS_TOTAL = Counter(
        "kafka_process_total", "Processor invocations", ["client"]
    )
    KAFKA_PROCESS_ERRORS = Counter(
        "kafka_process_errors_total", "Processor raised exceptions", ["client"]
    )
    KAFKA_COMMIT_TOTAL = Counter(
        "kafka_commit_total", "Commit attempts", ["client"]
    )
    KAFKA_COMMIT_ERRORS = Counter(
        "kafka_commit_errors_total", "Commit failures", ["client"]
    )

    AIOKAFKA_MSGS_YIELDED = Counter(
        "aiokafka_messages_yielded_total", "Async messages yielded", ["topic", "group"]
    )
    AIOKAFKA_START_STOP = Counter(
        "aiokafka_start_stop_total", "Start/Stop of async consumer", ["topic", "group", "action"]
    )

except Exception:  # pragma: no cover
    class _NoopCM:
        def __enter__(self):
            return None
        def __exit__(self, exc_type, exc, tb):
            return False

    class _NoopMetric:
        def labels(self, *args: object, **kwargs: object) -> "_NoopMetric":
            return self
        def inc(self, *args: object, **kwargs: object) -> None:
            pass
        def observe(self, *args: object, **kwargs: object) -> None:
            pass
        def time(self) -> "_NoopCM":
            return _NoopCM()

    Counter = Histogram = _NoopMetric  # type: ignore
    KAFKA_POLL_TOTAL = Counter()
    KAFKA_POLL_MSGS = Counter()
    KAFKA_POLL_ERRORS = Counter()
    KAFKA_POLL_LATENCY = Histogram()
    KAFKA_JSON_DECODE_ERRORS = Counter()
    KAFKA_DLT_PUBLISH_TOTAL = Counter()
    KAFKA_DLT_PUBLISH_ERRORS = Counter()
    KAFKA_PROCESS_TOTAL = Counter()
    KAFKA_PROCESS_ERRORS = Counter()
    KAFKA_COMMIT_TOTAL = Counter()
    KAFKA_COMMIT_ERRORS = Counter()
    AIOKAFKA_MSGS_YIELDED = Counter()
    AIOKAFKA_START_STOP = Counter()
# -------------------------------
# Optional Confluent Kafka import
# -------------------------------
try:
    from confluent_kafka import Consumer as ConfluentConsumer, KafkaException, KafkaError
except Exception:  # pragma: no cover
    ConfluentConsumer = None  # type: ignore
    KafkaException = Exception  # type: ignore
    KafkaError = Exception  # type: ignore

log = logging.getLogger("nexusa.core.kafka_consumer")
logging.basicConfig(level=logging.INFO)


# -------------------------------
# Protocol for DLT producer
# -------------------------------
class DLTProducerProto(Protocol):
    """Protocol for a Dead-Letter-Topic producer used on decode failures."""
    def produce_to_dlt(self, topic: str, value: bytes, reason: str) -> None: ...


class KafkaConsumerWrapper:
    """
    Kafka consumer with manual commits and a simple 'exactly-once-ish' processing pattern:
    - disable auto commit
    - call user processor(message_dict) and commit only on success
    - on JSON decode failure, publish to DLT via provided producer (optional)
    """

    def __init__(
        self,
        bootstrap_servers: str,
        group_id: str,
        client_id: str = "nexusa-consumer",
        topics: Optional[Iterable[str]] = None,
        extra_config: Optional[Dict[str, Any]] = None,
        dlt_producer: Optional[DLTProducerProto] = None,
        dlt_reason_on_decode: str = "json_decode_error",
    ) -> None:
        """Initialize the Confluent Kafka consumer and configuration.

        Args:
            bootstrap_servers: Kafka bootstrap servers string (host:port,...).
            group_id: Consumer group id.
            client_id: Client identifier for Kafka.
            topics: Optional list/iterable of topics to subscribe to.
            extra_config: Optional additional consumer configuration overrides.
            dlt_producer: Optional producer implementing DLTProducerProto for dead-lettering.
            dlt_reason_on_decode: Reason string included when publishing to DLT on decode errors.
        """
        if ConfluentConsumer is None:
            raise RuntimeError("confluent_kafka is required for KafkaConsumerWrapper")

        conf = {
            "bootstrap.servers": bootstrap_servers,
            "group.id": group_id,
            "enable.auto.commit": False,
            "auto.offset.reset": "earliest",
            "client.id": client_id,
            "session.timeout.ms": 10000,
            "max.poll.interval.ms": 300000,
            "fetch.max.bytes": 64 * 1024 * 1024,
            "isolation.level": "read_committed",
        }
        if extra_config:
            conf.update(extra_config)

        self._consumer = ConfluentConsumer(conf)
        self._topics = list(topics or [])
        self._dlt_producer = dlt_producer
        self._dlt_reason_on_decode = dlt_reason_on_decode
        self._client_label = client_id
        self._running = True

    def subscribe(self, topics: Iterable[str]) -> None:
        """Subscribe the consumer to the provided topics.

        Args:
            topics: Iterable of topic names to subscribe to.
        """
        self._topics = list(topics)
        self._consumer.subscribe(self._topics)

    def poll_and_process(self, processor: Callable[[Dict[str, Any]], bool], timeout: float = 1.0) -> None:
        """Poll for a message, JSON-decode its value, run the processor, and commit on success.

        Args:
            processor: Callable that processes decoded JSON and returns True on success.
            timeout: Poll timeout in seconds.

        Behavior:
            - On Kafka error (non-EOF), raises KafkaException.
            - On JSON decode failure, optionally publishes to DLT and does not commit.
            - On processor exception or False return, does not commit.
        """
        KAFKA_POLL_TOTAL.labels(self._client_label).inc()
        with KAFKA_POLL_LATENCY.labels(self._client_label).time():  # type: ignore[attr-defined]
            msg = self._consumer.poll(timeout)

        if msg is None:
            return
        KAFKA_POLL_MSGS.labels(self._client_label).inc()

        if msg.error():
            # Partition EOF is not an error for our flow
            try:
                code = msg.error().code()
            except Exception:
                code = "unknown"
            if hasattr(KafkaError, "_PARTITION_EOF") and code == KafkaError._PARTITION_EOF:  # type: ignore[attr-defined]
                return
            KAFKA_POLL_ERRORS.labels(self._client_label, str(code)).inc()
            raise KafkaException(msg.error())  # type: ignore[misc]

        value = msg.value()
        try:
            data = json.loads(value) if isinstance(value, (bytes, bytearray)) else json.loads(
                str(value).encode("utf-8")
            )
        except Exception:
            KAFKA_JSON_DECODE_ERRORS.labels(self._client_label).inc()
            log.exception("JSON decode failed; sending to DLT if configured")
            if self._dlt_producer:
                try:
                    payload = value if isinstance(value, (bytes, bytearray)) else str(value).encode("utf-8")
                    self._dlt_producer.produce_to_dlt(
                        msg.topic(),
                        payload,
                        self._dlt_reason_on_decode,
                    )
                    KAFKA_DLT_PUBLISH_TOTAL.labels(self._client_label, self._dlt_reason_on_decode).inc()
                except Exception:
                    KAFKA_DLT_PUBLISH_ERRORS.labels(self._client_label).inc()
                    log.exception("Failed to publish to DLT")
            # Do not commit; skip
            return

        KAFKA_PROCESS_TOTAL.labels(self._client_label).inc()
        ok = False
        try:
            ok = processor(data)
        except Exception:
            KAFKA_PROCESS_ERRORS.labels(self._client_label).inc()
            log.exception("Processor raised; skipping commit")
            ok = False

        if ok:
            KAFKA_COMMIT_TOTAL.labels(self._client_label).inc()
            try:
                self._consumer.commit(msg, asynchronous=False)
            except Exception:
                KAFKA_COMMIT_ERRORS.labels(self._client_label).inc()
                log.exception("Commit failed")

    def close(self) -> None:
        """Close the underlying Kafka consumer, ignoring cleanup errors."""
        try:
            self._consumer.close()
        except Exception:
            pass



    def stop(self) -> None:
        """Signal the consumer loop to stop gracefully."""
        self._running = False

    def run(self, processor: Callable[[Dict[str, Any]], bool], timeout: float = 1.0, backoff_base: float = 0.5, backoff_max: float = 10.0) -> None:
        """Run a resilient poll→process→commit loop with exponential backoff on errors.
        
        - Subscribes to `self._topics` if set.
        - Catches Kafka and unexpected errors; applies backoff instead of crashing.
        - Commits happen inside poll_and_process() only on success.
        - Loop exits when `stop()` is called.
        """
        if self._topics:
            try:
                self._consumer.subscribe(self._topics)
            except Exception:
                log.exception("Subscribe failed; will retry with backoff")
        backoff = backoff_base
        while self._running:
            try:
                self.poll_and_process(processor, timeout=timeout)
                # reset backoff on any successful poll/processing cycle
                backoff = backoff_base
            except KafkaException:
                log.warning("KafkaException in consumer loop; backing off for %.2fs", backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, backoff_max)
            except Exception:
                log.exception("Unexpected error in consumer loop; backing off for %.2fs", backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, backoff_max)
        # attempt to close cleanly
        try:
            self.close()
        except Exception:
            log.exception("Error during consumer close")
class AsyncKafkaConsumer:
    """
    Async Kafka consumer based on aiokafka for coroutine-driven usage.
    Useful for asyncio-based pipelines.
    """

    def __init__(self, topic: str, group_id: str) -> None:
        """Initialize the async consumer with a single topic and consumer group."""
        self.topic = topic
        self.group_id = group_id
        self.bootstrap = settings.kafka.bootstrap
        self._c: AIOKafkaConsumer | None = None

    async def __aenter__(self) -> "AsyncKafkaConsumer":
        """Start the aiokafka consumer on context entry and return self."""
        self._c = AIOKafkaConsumer(
            self.topic,
            bootstrap_servers=self.bootstrap,
            group_id=self.group_id,
            value_deserializer=lambda b: json.loads(b.decode("utf-8")),
            enable_auto_commit=True,
            auto_offset_reset="latest",
        )
        await self._c.start()
        AIOKAFKA_START_STOP.labels(self.topic, self.group_id, "start").inc()
        return self

    async def __aexit__(
        self,
        exc_type: Optional[type[BaseException]],
        exc: Optional[BaseException],
        tb: Optional[TracebackType],
    ) -> None:
        """Stop the aiokafka consumer on context exit (does not suppress exceptions)."""
        if self._c:
            await self._c.stop()
        AIOKAFKA_START_STOP.labels(self.topic, self.group_id, "stop").inc()

    async def consume(self) -> AsyncIterator[Any]:
        """Yield messages from the topic as they arrive (deserialized by value_deserializer)."""
        if self._c is None:
            raise RuntimeError("AsyncKafkaConsumer used outside of context manager")
        async for msg in self._c:
            AIOKAFKA_MSGS_YIELDED.labels(self.topic, self.group_id).inc()
            yield msg

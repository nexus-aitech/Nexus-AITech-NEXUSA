from __future__ import annotations
"""
signal_emitter
--------------
Assembles signal payloads (v2) and publishes them to Kafka if available,
falling back to local JSONL file writes otherwise.

Observability:
- Prometheus counters:
    * signals_assembled_total (by side)
    * signals_published_total (by sink=kafka|file, result=ok|fail)
    * kafka_delivery_fail_total
    * fallback_file_writes_total
- Prometheus histograms:
    * assemble_seconds
    * publish_seconds
"""

import os
import json
import uuid
import logging
import hashlib
import time
from dataclasses import dataclass
from typing import Dict, Any, Optional, Tuple, List, Callable

import pandas as pd
import numpy as np

log = logging.getLogger("signal_emitter")
if not log.handlers:
    log.setLevel(logging.INFO)
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s - %(message)s"))
    log.addHandler(_h)

# Optional Prometheus metrics
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

_ASSEMBLE_COUNT = (
    Counter(
        "signals_assembled_total",
        "Total number of assembled signals.",
        ["side"],
    )
    if Counter
    else None
)
_ASSEMBLE_SECONDS = (
    Histogram(
        "assemble_seconds",
        "Latency of assembling a signal payload in seconds.",
    )
    if Histogram
    else None
)
_PUBLISH_COUNT = (
    Counter(
        "signals_published_total",
        "Total number of published signals labeled by sink and result.",
        ["sink", "result"],  # sink: kafka|file, result: ok|fail
    )
    if Counter
    else None
)
_PUBLISH_SECONDS = (
    Histogram(
        "publish_seconds",
        "Latency of publishing a signal in seconds.",
    )
    if Histogram
    else None
)
_KAFKA_DELIVERY_FAIL = (
    Counter(
        "kafka_delivery_fail_total",
        "Count of kafka delivery failures reported via callback.",
    )
    if Counter
    else None
)
_FALLBACK_FILE_WRITES = (
    Counter(
        "fallback_file_writes_total",
        "Number of times publishing fell back to local file write.",
    )
    if Counter
    else None
)


class _Publisher:
    """Thin publisher abstraction: prefers Kafka, otherwise appends to JSONL file."""

    def __init__(self, topic: str, out_dir: str = "/mnt/data/NEXUSA/signals_out") -> None:
        """Initialize publisher with Kafka producer if available; else file sink."""
        self.topic = topic
        self.out_dir = out_dir
        os.makedirs(self.out_dir, exist_ok=True)
        self._use_kafka = False
        self._producer = None
        try:
            from confluent_kafka import Producer  # type: ignore
            conf = {
                "bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP", "localhost:9092"),
                "enable.idempotence": True,
                "compression.type": "zstd",
                "linger.ms": 5,
                "acks": "all",
            }
            self._producer = Producer(conf)
            self._use_kafka = True
        except Exception:
            # Kafka not available; will use file sink
            pass

    def publish(self, key: str, value: Dict[str, Any]) -> None:
        """Publish payload to Kafka if possible; otherwise write to file (JSONL)."""
        t0 = time.time()
        payload = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        sink = "file"
        result = "ok"

        if self._use_kafka and self._producer is not None:
            sink = "kafka"

            def _cb(err: Optional[Exception], msg: Any) -> None:
                """Kafka delivery callback; increments failure metric on error."""
                if err:
                    log.warning("Kafka delivery failed: %s", err)
                    if _KAFKA_DELIVERY_FAIL:
                        try:
                            _KAFKA_DELIVERY_FAIL.inc()
                        except Exception:
                            pass

            try:
                self._producer.produce(
                    self.topic,
                    key=key.encode("utf-8"),
                    value=payload.encode("utf-8"),
                    on_delivery=_cb,  # type: ignore[arg-type]
                )
                self._producer.poll(0)  # trigger delivery callbacks
            except Exception as e:
                log.warning("Kafka produce failed, falling back to file: %s", e)
                sink = "file"
                if _FALLBACK_FILE_WRITES:
                    try:
                        _FALLBACK_FILE_WRITES.inc()
                    except Exception:
                        pass
                try:
                    self._write_file(payload)
                except Exception as fe:
                    result = "fail"
                    log.error("File write failed after Kafka fallback: %s", fe)
        else:
            try:
                self._write_file(payload)
            except Exception as fe:
                result = "fail"
                log.error("File write failed: %s", fe)

        if _PUBLISH_SECONDS:
            try:
                _PUBLISH_SECONDS.observe(time.time() - t0)
            except Exception:
                pass
        if _PUBLISH_COUNT:
            try:
                _PUBLISH_COUNT.labels(sink=sink, result=result).inc()
            except Exception:
                pass

    def flush(self) -> None:
        """Flush pending Kafka messages (no-op for file sink)."""
        if self._use_kafka and self._producer is not None:
            try:
                self._producer.flush(2.0)
            except Exception:
                pass

    def _write_file(self, payload: str) -> None:
        """Append a JSON line to <out_dir>/<topic>.jsonl."""
        fname = os.path.join(self.out_dir, f"{self.topic}.jsonl")
        with open(fname, "a", encoding="utf-8") as f:
            f.write(payload + "\n")


@dataclass
class SLTPPolicy:
    """StopLoss/TakeProfit policy based on ATR and reward:risk ratio."""
    atr_multiple: float = 1.5
    rr_ratio: float = 2.0  # reward:risk


@dataclass
class SignalEmitterConfig:
    """Configuration for SignalEmitter."""
    topic: str = "signals.v2"
    sltp: SLTPPolicy = SLTPPolicy()
    version: str = "2.0.0"
    producer_out_dir: str = "/mnt/data/NEXUSA/signals_out"


class SignalEmitter:
    """
    Assemble Signal v2 payloads and publish to Kafka / file.

    Expected columns for `assemble` input row:
    symbol, timeframe, ts_event, close (ATR columns optional).
    """

    def __init__(self, cfg: SignalEmitterConfig) -> None:
        """Construct emitter with given configuration and publisher."""
        self.cfg = cfg
        self.publisher = _Publisher(topic=cfg.topic, out_dir=cfg.producer_out_dir)

    @staticmethod
    def _signal_id(symbol: str, timeframe: str, ts_event: pd.Timestamp) -> str:
        """Stable 16-hex signal id from (symbol,timeframe,ts_event[UTC ISO])."""
        base = f"{symbol}|{timeframe}|{pd.to_datetime(ts_event, utc=True).isoformat()}"
        return hashlib.sha256(base.encode("utf-8")).hexdigest()[:16]

    def _calc_sltp(self, side: str, close: float, atr: Optional[float]) -> Tuple[float, float]:
        """Compute SL/TP from side, close, and ATR using configured policy."""
        if not np.isfinite(close):
            raise ValueError("close price is NaN/inf; cannot compute SL/TP")
        risk = (atr if (atr is not None and np.isfinite(atr)) else (0.01 * close)) * self.cfg.sltp.atr_multiple
        side_u = side.upper()
        if side_u == "LONG":
            sl = close - risk
            tp = close + self.cfg.sltp.rr_ratio * risk
        elif side_u == "SHORT":
            sl = close + risk
            tp = close - self.cfg.sltp.rr_ratio * risk
        else:  # NEUTRAL or unknown
            sl = close
            tp = close
        return float(sl), float(tp)

    @staticmethod
    def _find_atr(row: pd.Series) -> Optional[float]:
        """Extract a finite ATR value from any column name containing 'atr' (case-insensitive)."""
        for c in row.index:
            lc = str(c).lower()
            if "atr" in lc:
                try:
                    v = float(row[c])
                    if np.isfinite(v):
                        return v
                except Exception:
                    continue
        return None

    @staticmethod
    def _clamp_prob(x: float) -> float:
        """Clamp probability to [0,1]."""
        try:
            return float(min(1.0, max(0.0, x)))
        except Exception:
            return 0.0

    def assemble(
        self,
        row: pd.Series,
        prob_tp: float,
        side: str,
        model_version: str,
        rationale: Optional[Dict[str, Any]] = None,
        risk_status: Optional[Dict[str, Any]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Assemble a v2 signal payload from inputs (does not publish)."""
        t0 = time.time()
        symbol = str(row.get("symbol"))
        timeframe = str(row.get("timeframe"))
        ts_event = pd.to_datetime(row.get("ts_event"), utc=True, errors="coerce")
        if ts_event is pd.NaT:
            raise ValueError("ts_event is invalid/NaT")
        close = float(row.get("close")) if row.get("close") is not None else float("nan")
        atr_val = self._find_atr(row)
        sl, tp = self._calc_sltp(side, close, atr_val)

        payload: Dict[str, Any] = {
            "schema_version": self.cfg.version,
            "signal_id": self._signal_id(symbol, timeframe, ts_event),
            "symbol": symbol,
            "tf": timeframe,                         # schema alignment with storage
            "ts_event": ts_event.isoformat(),
            "ts_signal": pd.Timestamp.now(tz="UTC").isoformat(),
            "side": side.upper(),                    # LONG/SHORT/NEUTRAL
            "prob_tp": self._clamp_prob(prob_tp),   # 0..1
            "entry": close,
            "sl": sl,
            "tp": tp,
            "model_version": model_version,
        }

        if rationale:
            payload["rationale"] = {
                "rationale_id": rationale.get("rationale_id"),
                "top_features": rationale.get("top_features", []),
            }
        if risk_status:
            payload["risk"] = risk_status
        if extra:
            payload["extra"] = extra

        if _ASSEMBLE_COUNT:
            try:
                _ASSEMBLE_COUNT.labels(side=payload["side"]).inc()
            except Exception:
                pass
        if _ASSEMBLE_SECONDS:
            try:
                _ASSEMBLE_SECONDS.observe(time.time() - t0)
            except Exception:
                pass

        return payload

    def publish(self, payload: Dict[str, Any]) -> None:
        """Publish an already-assembled payload via underlying publisher."""
        key = payload.get("signal_id") or uuid.uuid4().hex
        self.publisher.publish(key=key, value=payload)

    def close(self) -> None:
        """Flush outstanding messages (Kafka)."""
        self.publisher.flush()


# --- Direction decision utility (uppercase, aligned with SL/TP) ---
def decide_direction(score: float, upper_thresh: float = 0.35, lower_thresh: float = -0.35) -> str:
    """Map a continuous score to LONG/SHORT/NEUTRAL using symmetric thresholds."""
    if score >= upper_thresh:
        return "LONG"
    if score <= lower_thresh:
        return "SHORT"
    return "NEUTRAL"


# --- High-level helper: emit from a scored DataFrame (modern) ---
def emit_from_df(
    df: pd.DataFrame,
    emitter: SignalEmitter,
    prob_col: Optional[str] = None,
    score_col: str = "final_score",
    model_version: str = "simple-v1",
) -> List[Dict[str, Any]]:
    """
    Emit signals for each row of df.

    Requires columns: symbol, timeframe, ts_event, close.
    One of:
      - prob_col (0..1) for TP probability (preferred), or
      - score_col (maps to side; probability approximated).
    """
    required = {"symbol", "timeframe", "ts_event", "close"}
    missing = required - set(df.columns)
    if missing:
        raise KeyError(f"Missing required columns: {missing}")

    out: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        if prob_col and prob_col in df.columns:
            prob_tp = float(row[prob_col])
            side = decide_direction(float(row.get(score_col, 0.0))) if score_col in df.columns else "NEUTRAL"
        else:
            sc = float(row.get(score_col, 0.0))
            side = decide_direction(sc)
            # simple mapping score -> prob (fallback)
            prob_tp = float(min(1.0, max(0.0, 0.5 + sc / 2.0)))

        payload = emitter.assemble(
            row=row,
            prob_tp=prob_tp,
            side=side,
            model_version=model_version,
            rationale=None,
            risk_status=None,
            extra=None,
        )
        emitter.publish(payload)
        out.append(payload)
    return out


# --- Legacy adapter (kept for backwards compatibility; prefer SignalEmitter) ---
def adapt_legacy_emit(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Legacy format adapter:
      {signal_id, symbol, tf, score, direction, created_at, ...}
    Prefer using `emit_from_df` with `SignalEmitter`.
    """
    out: List[Dict[str, Any]] = []
    for row in df.itertuples(index=False):
        score = float(getattr(row, "final_score"))
        side = decide_direction(score)
        payload = {
            "signal_id": str(uuid.uuid4()),
            "symbol": getattr(row, "symbol"),
            "tf": getattr(row, "timeframe", getattr(row, "tf", "")),
            "score": score,
            "direction": side.title(),  # Long/Short/Neutral
            "entry": getattr(row, "close", None),
            "stop_loss": None,
            "take_profit": [],
            "confidence": float(abs(score)),
            "model_id": "simple-v1",
            "created_at": pd.Timestamp.utcfromtimestamp(
                (getattr(row, "timestamp", None) or pd.Timestamp(getattr(row, "ts_event")).timestamp() * 1000) / 1000.0
            ).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "rationale_id": "n/a",
        }
        out.append(payload)
    return out

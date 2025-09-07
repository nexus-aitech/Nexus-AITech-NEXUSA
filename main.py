"""NEXUSA main entrypoint.

- FastAPI app bootstrap + pipeline runner (ingestion → features → signals → backtest)
- Replaces bare `print()` with structured logging
- Adds missing docstrings and type hints called out by linters
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import uvicorn
from dataclasses import dataclass
from pathlib import Path
from fastapi import FastAPI
from typing import Any, Dict, List, Optional, Tuple, Callable
from backtesting.backtesting_engine import evaluate
from orchestration.fastapi_server import app as orchestration_app
from dotenv import load_dotenv
load_dotenv(".env.production")
load_dotenv(".env", override=True)  # این خط مهمه
# load_dotenv(".env", override=True)

# ===== App (ASGI) =====
app = FastAPI(title="NEXUSA Unified API", version="1.0.0")

@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}

# Ensure project root on path
sys.path.append(str(Path(__file__).resolve().parent))

# ========= NEXUSA recommended direct imports (guarded) =========

# --- Orchestration core ---
try:
    from orchestration.orchestrator import run as orchestrator_run, tasks as orchestrator_tasks  # فراخوانی مستقیم
except Exception:
    orchestrator_run = None
    orchestrator_tasks = None

try:
    from orchestration.dags.model_lifecycle import build_features as dag_build_features  # فراخوانی مستقیم
except Exception:
    dag_build_features = None

# already fixed above:
# from orchestration.fastapi_server import app as orchestration_app

# --- Ingestion ---
try:
    from ingestion.ingestion_manager import tasks as ingestion_tasks  # فراخوانی مستقیم
except Exception:
    ingestion_tasks = None

# --- Backtesting ---
try:
    from backtesting.contract_tester import evaluate as contract_evaluate, register as contract_register  # فراخوانی مستقیم
except Exception:
    contract_evaluate = None
    contract_register = None

try:
    from backtesting.backtesting_engine import evaluate as backtest_evaluate  # (در کد فعلی‌ات هم وجود دارد)
except Exception:
    backtest_evaluate = None

try:
    from backtesting.config_hashing import main as backtest_config_main  # فراخوانی مستقیم
except Exception:
    backtest_config_main = None

try:
    from backtesting.runner import main as backtest_runner_main  # فراخوانی مستقیم
except Exception:
    backtest_runner_main = None

# --- Core / ML ---
try:
    from core.ml_model import evaluate as ml_evaluate, fit as ml_fit, train as ml_train  # فراخوانی مستقیم
except Exception:
    ml_evaluate = ml_fit = ml_train = None

# --- Signals ---
try:
    from signals.model_runner import predict as signal_predict  # فراخوانی مستقیم
except Exception:
    signal_predict = None

try:
    from signals.registry import register as signal_register  # فراخوانی مستقیم
except Exception:
    signal_register = None

try:
    import signals.signal_emitter as signal_emitter  # فراخوانی مستقیم (ماژول)
except Exception:
    signal_emitter = None

try:
    import signals.rationale_mapper as rationale_mapper  # فراخوانی مستقیم (ماژول)
except Exception:
    rationale_mapper = None

try:
    import signals.risk_controller as risk_controller  # فراخوانی مستقیم (ماژول)
except Exception:
    risk_controller = None

# --- Storage ---
try:
    from storage.schema_registry import register as storage_register  # فراخوانی مستقیم
except Exception:
    storage_register = None

# --- Reports ---
try:
    from reports.prompt_templates import register as reports_register  # فراخوانی مستقیم
except Exception:
    reports_register = None

# --- Services (FastAPI apps) ---
# (شما از قبل این‌ها را mount می‌کنید؛ این ایمپورت‌ها برای دسترسی مستقیم هم هست)
try:
    from services.assessment.app import app as assessment_app  # فراخوانی مستقیم
except Exception:
    assessment_app = None
try:
    from services.community.app import app as community_app  # فراخوانی مستقیم
except Exception:
    community_app = None
try:
    from services.content.app import app as content_app  # فراخوانی مستقیم
except Exception:
    content_app = None
try:
    from services.content.routes import router as content_router  # فراخوانی مستقیم
except Exception:
    content_router = None
try:
    from services.lab.app import app as lab_app  # فراخوانی مستقیم
except Exception:
    lab_app = None
try:
    from services.recommender.app import app as recommender_app  # فراخوانی مستقیم
except Exception:
    recommender_app = None
try:
    from services.tutor.app import app as tutor_app  # فراخوانی مستقیم
except Exception:
    tutor_app = None

# ===== Init Logger =====
try:
    from core.logging.logger import get_logger  # project logger
except Exception:
    # Minimal fallback logger if project logger missing
    def get_logger(name: str = "nexusa", level: int | None = None) -> logging.Logger:
        """Return a configured stdlib logger (fallback)."""
        log = logging.getLogger(name)
        if not log.handlers:
            handler = logging.StreamHandler(sys.stdout)
            fmt = "[%(asctime)s] %(levelname)s %(name)s: %(message)s"
            handler.setFormatter(logging.Formatter(fmt))
            log.addHandler(handler)
        log.setLevel(level or logging.INFO)
        return log

logger = get_logger("main")

logger.info("✨ NEXUSA booting up…")
logger.debug("Logger initialized")

# ===== Load Config =====
try:
    from core.config.loader import load_config  # project loader
except Exception as e:
    logger.warning("Failed to import core.config.loader: %s", e)

    def load_config(path: str | Path = "config.yaml") -> Dict[str, Any]:
        """Fallback YAML config loader used when project loader unavailable."""
        try:
            import yaml  # lazy import
            with open(path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        except Exception as inner_e:
            logger.error("Failed to load fallback config: %s", inner_e)
            return {}

config = load_config("config.yaml")
logger.debug("Loaded config: %s", config)

if isinstance(config, dict) and config.get("debug"):
    logger.info("🔧 Debug mode is ON")

# ===== Mount Routers (if available) =====
try:
    app.include_router(content_router, prefix="/content", tags=["content"])
except Exception as e:
    logger.warning("content router unavailable: %s", e)

def _mount_subapp(prefix: str, import_path: str) -> None:
    """Mount a sub ASGI app if present; log otherwise."""
    try:
        module_path, var_name = import_path.rsplit(":", 1)
        mod = __import__(module_path, fromlist=[var_name])
        subapp = getattr(mod, var_name)
        app.mount(prefix, subapp)
        logger.info("Mounted %s at %s", import_path, prefix)
    except Exception as e:
        logger.warning("Failed to mount %s at %s: %s", import_path, prefix, e)

_mount_subapp("/assessment", "services.assessment.app:app")
_mount_subapp("/tutor", "services.tutor.app:app")
_mount_subapp("/lab", "services.lab.app:app")
_mount_subapp("/recommender", "services.recommender.app:app")
_mount_subapp("/community", "services.community.app:app")

# Export ASGI for uvicorn/gunicorn
__all__ = ["app"]

# ===== Optional .env loader =====
try:
    from dotenv import load_dotenv  # type: ignore
except Exception:
    load_dotenv = None  # type: ignore

def _load_env() -> None:
    """Load environment variables from a `.env` file if python-dotenv is installed."""
    if load_dotenv:
        try:
            load_dotenv(override=False)
            logger.debug(".env loaded")
        except Exception as e:
            logger.debug("load_dotenv failed: %s", e)

# ===== Domain modules (guarded imports) =====
try:
    from features.feature_engine import FeatureEngine, FeatureSpec  # type: ignore
except Exception as e:
    FeatureEngine = None  # type: ignore
    FeatureSpec = None  # type: ignore
    logger.warning("FeatureEngine unavailable: %s", e)

try:
    from signals.rule_engine import rule_score  # type: ignore
except Exception as e:
    rule_score = None  # type: ignore
    logger.warning("rule_score unavailable: %s", e)

try:
    from signals.final_scorer import final_score  # type: ignore
except Exception as e:
    final_score = None  # type: ignore
    logger.warning("final_score unavailable: %s", e)

try:
    from backtesting.backtesting_engine import evaluate  # type: ignore
except Exception as e:
    evaluate = None  # type: ignore
    logger.warning("evaluate unavailable: %s", e)

# WS fetcher glue (used by live ingestion)
try:
    from ws_fetcher import WSBackoff, WSConfig, Subscription, stream_market_data  # type: ignore
except Exception as e:
    WSBackoff = WSConfig = Subscription = stream_market_data = None  # type: ignore
    logger.warning("ws_fetcher unavailable: %s", e)

# ===== Types & Context =====
@dataclass
class Context:
    """Execution context spanning pipeline steps."""
    cfg: Dict[str, Any]
    log: logging.Logger
    data_path: Optional[Path] = None
    raw: List[Dict[str, Any]] | None = None
    features: List[Dict[str, Any]] | None = None
    signals: List[Dict[str, Any]] | None = None
    backtest: Dict[str, Any] | None = None
    _warnings: List[str] | None = None

    def warn(self, msg: str) -> None:
        """Collect a warning message for the final summary."""
        if self._warnings is None:
            self._warnings = []
        self._warnings.append(msg)
        self.log.warning(msg)

AsyncStep = Callable[[Context], "Context"] | Callable[[Context], "asyncio.Future[Context]"]

# ===== Utilities =====
def _json(obj: Any) -> str:
    """Serialize an object to JSON (safe fallback to str on error)."""
    try:
        return json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        return str(obj)

def _load_raw_from_jsonl(path: Path) -> List[Dict[str, Any]]:
    """Load newline-delimited JSON (JSONL) into a list of dict rows."""
    rows: List[Dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s:
                    continue
                try:
                    rows.append(json.loads(s))
                except Exception as e:
                    logger.debug("Skip invalid JSONL line: %s", e)
    except Exception as e:
        logger.warning("Failed to read %s: %s", path, e)
    return rows

# ===== Steps =====
def cfg_get(obj: Any, key: str, default: Any = None) -> Any:
    """Safely get a config value from pydantic model, dict, or attribute."""
    if obj is None:
        return default
    if hasattr(obj, "model_dump"):
        try:
            return obj.model_dump().get(key, default)  # pydantic v2
        except Exception:
            pass
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)

def mk_ws_cfg(cfg: Dict[str, Any]) -> "WSConfig":
    """Map app config to WSConfig (reconnects, timeouts, queue sizes)."""
    if WSConfig is None or WSBackoff is None:
        raise RuntimeError("ws_fetcher not available")
    w = (cfg.get("ingestion", {}) or {}).get("ws", {}) or {}
    return WSConfig(
        ping_interval=w.get("ping_interval_sec", 20),
        read_timeout=w.get("pong_timeout_sec", 30),
        max_retries=w.get("max_retries", 0),
        backoff=WSBackoff(
            initial_sec=((w.get("backoff") or {}).get("initial_sec", 1.0)),
            max_sec=((w.get("backoff") or {}).get("max_sec", 30.0)),
            factor=((w.get("backoff") or {}).get("factor", 1.8)),
        ),
        subscribe_batch_size=w.get("subscribe_batch_size", 20),
        max_queue=w.get("max_queue", 10000),
        open_timeout=w.get("connect_timeout_sec", 10),
    )

def mk_subs(cfg: Dict[str, Any]) -> List["Subscription"]:
    """Build a list of WS subscriptions from config (exchanges × symbols × streams × tfs)."""
    if Subscription is None:
        raise RuntimeError("ws_fetcher not available")
    subs: List[Subscription] = []
    ing = cfg.get("ingestion", {}) or {}
    exs = ing.get("exchanges", []) or []
    syms = ing.get("symbols", []) or []
    streams = ing.get("streams", []) or []
    tfs = ing.get("timeframes", []) or []
    for ex in exs:
        for sym in syms:
            for stream in streams:
                if stream == "kline":
                    for tf in tfs:
                        subs.append(Subscription(exchange=ex, symbol=sym, stream="kline", tf=tf))
                else:
                    subs.append(Subscription(exchange=ex, symbol=sym, stream=stream, tf=None))
    return subs

async def _run_ws_live(ctx: Context) -> Context:
    """Pull a bootstrap sample via live WebSocket streams into `ctx.raw`."""
    ws_cfg = mk_ws_cfg(ctx.cfg)
    subs = mk_subs(ctx.cfg)
    ctx.raw = []
    bootstrap_n = 1000
    async for ev in stream_market_data(subs, ws_cfg):  # type: ignore[arg-type]
        row = {
            "symbol": ev.get("symbol"),
            "ts": ev.get("ts_event"),
            "tf": ev.get("tf"),
            "close": ev.get("close"),
            "open": ev.get("open"),
            "high": ev.get("high"),
            "low": ev.get("low"),
            "volume": ev.get("volume"),
        }
        ctx.raw.append(row)
        if len(ctx.raw) >= bootstrap_n:
            break
    return ctx

def step_ingestion(ctx: Context) -> Context:
    """Ingestion step: read from file if provided; otherwise optional live WS bootstrap."""
    if ctx.data_path:
        ctx.raw = _load_raw_from_jsonl(ctx.data_path)
        return ctx

    pl = cfg_get(ctx.cfg, "pipeline", {})
    ing = cfg_get(ctx.cfg, "ingestion", {})
    mode = str(cfg_get(pl, "mode", "pipeline")).lower()
    methods = {m.lower() for m in (cfg_get(ing, "methods", []) or [])}

    if mode == "live" and "websocket" in methods and stream_market_data is not None:
        async def _runner() -> Context:
            return await _run_ws_live(ctx)

        try:
            ctx = asyncio.run(_runner())
        except RuntimeError:
            loop = asyncio.new_event_loop()
            ctx = loop.run_until_complete(_runner())
            loop.close()
    return ctx

def step_features(ctx: Context) -> Context:
    """Feature engineering step: use project FeatureEngine or minimal fallback."""
    rows = ctx.raw or []
    if not rows:
        ctx.warn("no raw data for features")
        ctx.features = []
        return ctx

    if FeatureEngine is None:
        feats: List[Dict[str, Any]] = []
        prev: Dict[str, Any] | None = None
        for r in rows:
            ret1 = 0.0
            if prev and prev.get("symbol") == r.get("symbol"):
                denom = float(prev.get("close") or 0.0)
                ret1 = ((float(r.get("close") or 0.0) - denom) / denom) if denom else 0.0
            feats.append({**r, "ret1": ret1})
            prev = r
        ctx.features = feats
        ctx.warn("FeatureEngine not available; used minimal fallback")
        return ctx

    try:
        import pandas as pd  # rely on project deps
        engine = FeatureEngine(config=ctx.cfg.get("features", {}) if ctx.cfg else {})
        df_out = engine.compute(pd.DataFrame(rows))
        ctx.features = df_out.to_dict(orient="records")
    except Exception as e:
        ctx.warn(f"FeatureEngine failed: {e!s}")
        ctx.features = []
    return ctx

def step_signals(ctx: Context) -> Context:
    """Signal generation + final scoring with project functions or simple fallbacks."""
    feats = ctx.features or []
    if not feats:
        ctx.warn("no features for signals")
        ctx.signals = []
        return ctx

    # Raw rule-based signals
    raw_sigs: List[Dict[str, Any]] = []
    try:
        if rule_score is not None:
            raw_sigs = list(rule_score(feats))  # project API
        else:
            for f in feats:
                rs = 1.0 if float(f.get("ret1", 0.0)) > 0 else -1.0
                raw_sigs.append({"symbol": f.get("symbol"), "ts": f.get("ts"), "raw_signal": rs})
            ctx.warn("rule_score not available; used fallback rule")
    except Exception as e:
        ctx.warn(f"rule_score failed: {e!s}")
        raw_sigs = []

    # Final scoring
    scored: List[Dict[str, Any]] = []
    try:
        if final_score is not None:
            scored = list(final_score(raw_sigs))  # project API
        else:
            for s in raw_sigs:
                score = (float(s.get("raw_signal", 0.0)) + 1.0) / 2.0
                scored.append({"symbol": s.get("symbol"), "ts": s.get("ts"), "score": score})
            ctx.warn("final_score not available; used fallback scoring")
    except Exception as e:
        ctx.warn(f"final_score failed: {e!s}")
        scored = []

    ctx.signals = scored
    return ctx

def step_backtest(ctx: Context) -> Context:
    """Backtest step: use project evaluator or a minimal Sharpe-like fallback."""
    sigs = ctx.signals or []
    rows = ctx.raw or []
    if not sigs or not rows:
        ctx.warn("no signals/raw for backtest")
        ctx.backtest = {"n": 0, "pnl_sum": 0.0, "pnl_mean": 0.0, "sharpe_like": 0.0}
        return ctx

    if evaluate is None:
        pnl: List[float] = []
        prev: Dict[str, Any] | None = None
        prices_by_ts: Dict[Tuple[str, Any], float] = {}
        for r in rows:
            ret = 0.0
            if prev and prev.get("symbol") == r.get("symbol"):
                denom = float(prev.get("close") or 0.0)
                ret = ((float(r.get("close") or 0.0) - denom) / denom) if denom else 0.0
            key = (str(r.get("symbol")), r.get("ts"))
            prices_by_ts[key] = ret
            prev = r
        for s in sigs:
            key = (str(s.get("symbol")), s.get("ts"))
            ret = prices_by_ts.get(key, 0.0)
            pnl.append(ret * float(s.get("score", 0.0)))
        total = sum(pnl)
        mean = (total / len(pnl)) if pnl else 0.0
        var = sum((x - mean) ** 2 for x in pnl) / len(pnl) if pnl else 0.0
        sharpe_like = (mean / (var ** 0.5)) if var > 0 else 0.0
        ctx.backtest = {"n": len(pnl), "pnl_sum": total, "pnl_mean": mean, "sharpe_like": sharpe_like}
        ctx.warn("evaluate not available; used fallback backtest")
        return ctx

    try:
        result = evaluate(rows, sigs)  # project API
        ctx.backtest = {
            "n": result.get("n", 0),
            "pnl_sum": result.get("pnl_sum", 0.0),
            "pnl_mean": result.get("pnl_mean", 0.0),
            "sharpe_like": result.get("sharpe_like", 0.0),
        }
    except Exception as e:
        ctx.warn(f"evaluate failed: {e!s}")
        ctx.backtest = {"n": 0, "pnl_sum": 0.0, "pnl_mean": 0.0, "sharpe_like": 0.0}
    return ctx

# ===== Pipeline composer =====
try:
    from core.config.types import AppConfig  # type: ignore
except Exception:
    # Keep signature name; use typing fallback to avoid import errors.
    from typing import Any as AppConfig  # type: ignore[misc,assignment]

def compose_pipeline(cfg: AppConfig) -> List[Callable[[Context], Context]]:
    """Compose enabled pipeline steps from config, defaulting to the standard 4-step flow."""
    default_steps = ["ingestion", "features", "signals", "backtest"]
    pl = getattr(cfg, "pipeline", None)
    steps = getattr(pl, "steps", None) if pl is not None else None
    steps = steps or (cfg.get("pipeline", {}).get("steps") if isinstance(cfg, dict) else None) or default_steps

    mapping: Dict[str, Callable[[Context], Context]] = {
        "ingestion": step_ingestion,
        "features": step_features,
        "signals": step_signals,
        "backtest": step_backtest,
    }

    resolved: List[Callable[[Context], Context]] = []
    for s in steps:
        fn = mapping.get(s)
        if not fn:
            raise ValueError(f"Unknown pipeline step: {s}")
        resolved.append(fn)
    return resolved

# ===== CLI & Runner =====
def _setup_signals(loop: asyncio.AbstractEventLoop, log: logging.Logger) -> asyncio.Event:
    """Install SIGINT/SIGTERM handlers that flip an asyncio.Event for graceful shutdown."""
    stop = asyncio.Event()

    def on_signal(sig: signal.Signals) -> None:
        """Signal handler that logs and triggers shutdown."""
        name = getattr(sig, "name", str(sig))
        log.info("received signal %s, shutting down…", name)
        stop.set()

    for s in (getattr(signal, "SIGINT", None), getattr(signal, "SIGTERM", None)):
        if s:
            try:
                loop.add_signal_handler(s, lambda s=s: on_signal(s))  # type: ignore[arg-type]
            except NotImplementedError:
                # Some platforms (e.g., Windows) may not support it in certain contexts
                # Fallback: register a synchronous handler that flips the stop event thread-safely.
                def _sync_signal_handler(sig=None, frame=None):
                    try:
                        loop.call_soon_threadsafe(stop.set)
                        log.info("received signal %s (sync fallback), shutting down…", getattr(sig, "name", str(sig)))
                    except Exception:
                        pass  # loop may already be closed
                try:
                    signal.signal(s, _sync_signal_handler)  # type: ignore[arg-type]
                except Exception:
                    log.debug("signal.signal fallback not available for %s", s)

    return stop

def main() -> None:
    """Main CLI entrypoint: parse args, run pipeline, and log a summary JSON."""
    _load_env()
    log = logger  # reuse global logger

    # Parse CLI
    import argparse
    ap = argparse.ArgumentParser(prog="NEXUSA", description="NEXUSA main entrypoint")
    ap.add_argument("--input", help="Path to JSONL of raw OHLCV rows (optional).", default=None)
    ap.add_argument("--config", help="Path to config.yaml", default="config.yaml")
    ap.add_argument("--mode", choices=["pipeline", "print-config"], default="pipeline")
    args = ap.parse_args()

    cfg = load_config(args.config) or {}
    ctx = Context(cfg=cfg, log=log, data_path=Path(args.input) if args.input else None)

    if args.mode == "print-config":
        log.info(_json(cfg))
        return

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    stop_evt = _setup_signals(loop, log)

    steps = compose_pipeline(cfg)  # type: ignore[arg-type]
    for step in steps:
        ctx = step(ctx)

    summary = {
        "warnings": ctx._warnings or [],
        "raw_n": len(ctx.raw or []),
        "features_n": len(ctx.features or []),
        "signals_n": len(ctx.signals or []),
        "backtest": ctx.backtest or {},
    }
    log.info(_json(summary))

    if stop_evt.is_set():
        log.info("shutdown completed")

if __name__ == "__main__":
    import multiprocessing

    multiprocessing.freeze_support()  # Needed on Windows
    # If you need pre-server work, do it in main()
    # main()

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
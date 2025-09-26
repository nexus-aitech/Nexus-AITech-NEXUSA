"""Demo Usage of VIP pipeline (offline).
Run inside project environment: python vip_demo_usage.py
"""
from signals.model_runner import run
from signals.signal_emitter import to_markdown
from datetime import datetime, timezone

features = {
    "buzz_score": 0.7,               # 0..1 — از ماژول meme/روایت
    "exchange_netflow_norm": -0.3,   # -1..1 — منفی یعنی خروج از صرافی
}

context = {
    "symbol": "PEPE",
    "portfolio_drawdown": -0.05,
    "liquidity_usd": 5_000_000,
    "max_drawdown_block": -0.3,
    "min_liquidity_usd": 1_000_000,
    "max_risk_per_trade": 0.02,
    "limits": {"per_symbol_cap": 0.05, "portfolio_cap": 1.0},
    "long_threshold": 60, "flat_threshold": 40,
    "timestamp": datetime.now(timezone.utc).isoformat(),
}

out = run(features, context)
print(to_markdown(out))

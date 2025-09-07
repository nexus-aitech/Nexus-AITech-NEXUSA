"""Model Runner
زنجیره‌ی اجرای: registry → rules → scoring → risk → emit
"""
from typing import Dict, Any, Callable
from .registry import REGISTRY
from .rule_engine import RuleEngine, block_if_drawdown_high, require_min_liquidity
from .final_scorer import weighted_score
from .risk_controller import position_size, apply_limits
from .rationale_mapper import map_rationale

def run(features: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    # 1) سیگنال‌های جزئی
    signals = REGISTRY.run_all(features, context)

    # 2) افزودن context برای قوانین
    signals["context"] = {
        "portfolio_drawdown": context.get("portfolio_drawdown", 0.0),
        "liquidity_usd": context.get("liquidity_usd", 1e9),
    }

    # 3) قوانین
    re = RuleEngine()
    re.add_rule(block_if_drawdown_high(threshold=context.get("max_drawdown_block", -0.3)))
    re.add_rule(require_min_liquidity(min_usd=context.get("min_liquidity_usd", 1_000_000)))
    signals = re.apply(signals)

    # 4) امتیاز نهایی
    score = weighted_score(signals, context.get("weights"))

    # 5) اندازه پوزیشن + حدود ریسک
    alloc = position_size(score, max_risk_per_trade=context.get("max_risk_per_trade", 0.01))
    alloc_capped = apply_limits(context.get("symbol", "TICKER"), alloc, context.get("limits", {}))

    # 6) خلاصه و دلیل
    rationale = map_rationale(signals, score)

    # 7) خروجی نهایی
    side = "long" if score >= context.get("long_threshold", 60) else ("flat" if score >= context.get("flat_threshold", 40) else "flat")
    return {
        "symbol": context.get("symbol", "TICKER"),
        "score": round(score, 2),
        "side": side,
        "allocation": round(alloc_capped, 4),
        "signals": signals,
        "rationale": rationale,
        "risk": {
            "max_risk_per_trade": context.get("max_risk_per_trade", 0.01),
            "limits": context.get("limits", {})
        },
        "timestamp": context.get("timestamp"),
    }

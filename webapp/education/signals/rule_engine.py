"""Rule Engine
قوانین تأیید/ابطال/فیلتر سیگنال‌ها.
"""
from typing import Dict, Any, List, Callable

class RuleEngine:
    def __init__(self):
        self.rules: List[Callable[[Dict[str, Any]], Dict[str, Any]]] = []

    def add_rule(self, rule: Callable[[Dict[str, Any]], Dict[str, Any]]):
        self.rules.append(rule)

    def apply(self, signal_bundle: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        out = {k: v.copy() for k, v in signal_bundle.items()}
        for rule in self.rules:
            out = rule(out)
        return out

# نمونه قوانین
def block_if_drawdown_high(threshold: float = -0.2):
    def _rule(bundle):
        dd = bundle.get("context", {}).get("portfolio_drawdown", 0.0)
        if dd <= threshold:
            for k, v in bundle.items():
                if k == "context": 
                    continue
                v["blocked"] = True
                v.setdefault("notes", []).append(f"blocked: drawdown {dd:.2%} <= {threshold:.2%}")
        return bundle
    return _rule

def require_min_liquidity(min_usd: float = 1_000_000):
    def _rule(bundle):
        liq = bundle.get("context", {}).get("liquidity_usd", float("inf"))
        if liq < min_usd:
            for k, v in bundle.items():
                if k == "context":
                    continue
                v["blocked"] = True
                v.setdefault("notes", []).append(f"blocked: liquidity ${liq:,.0f} < ${min_usd:,.0f}")
        return bundle
    return _rule

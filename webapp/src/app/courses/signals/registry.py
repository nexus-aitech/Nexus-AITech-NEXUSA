"""Signals Registry
ثبت/مدیریت سیگنال‌های جزئی (feature → signal).
هر سیگنال یک تابع است: `fn(features: dict, context: dict) -> dict`
"""
from typing import Callable, Dict, Any

class SignalRegistry:
    def __init__(self):
        self._reg: Dict[str, Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]] = {}

    def register(self, name: str, fn: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]):
        if name in self._reg:
            raise ValueError(f"Signal already registered: {name}")
        self._reg[name] = fn

    def run_all(self, features: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Dict[str, Any]]:
        context = context or {}
        outputs = {}
        for name, fn in self._reg.items():
            try:
                outputs[name] = fn(features, context)
            except Exception as e:
                outputs[name] = {"error": str(e)}
        return outputs

REGISTRY = SignalRegistry()

# --- نمونه سیگنال‌ها (ساده/قابل‌توسعه) ---
def signal_memecoin_buzz(features: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """مثال: امتیاز «بازتاب میم» بر اساس حجم جست‌وجو/توئیتر (features: buzz_score 0..1)."""
    buzz = float(features.get("buzz_score", 0.0))
    return {"name": "memecoin_buzz", "score": buzz * 100, "rationale": f"Buzz={buzz:.2f}"}

def signal_onchain_netflow(features: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """مثال: سیگنال جریان صرافی (netflow منفی → برداشت). نرمال‌سازی‌شده -1..1."""
    nf = float(features.get("exchange_netflow_norm", 0.0))
    score = ( -nf ) * 50 + 50  # برداشت قوی → امتیاز بالاتر
    return {"name": "onchain_netflow", "score": max(0, min(100, score)), "rationale": f"NetflowNorm={nf:.2f}"}

# ثبت نمونه‌ها
REGISTRY.register("memecoin_buzz", signal_memecoin_buzz)
REGISTRY.register("onchain_netflow", signal_onchain_netflow)

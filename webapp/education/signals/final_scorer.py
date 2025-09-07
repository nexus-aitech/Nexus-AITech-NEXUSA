"""Final Scorer
ترکیب سیگنال‌های جزئی به امتیاز نهایی 0..100.
"""
from typing import Dict, Any

DEFAULT_WEIGHTS = {
    "memecoin_buzz": 0.3,
    "onchain_netflow": 0.7,
}

def weighted_score(signals: Dict[str, Dict[str, Any]], weights: Dict[str, float] = None) -> float:
    weights = weights or DEFAULT_WEIGHTS
    num = 0.0
    den = 0.0
    for name, w in weights.items():
        s = signals.get(name, {}).get("score")
        if s is None: 
            continue
        if signals.get(name, {}).get("blocked"): 
            continue
        num += float(s) * w
        den += w
    return 0.0 if den == 0 else num / den

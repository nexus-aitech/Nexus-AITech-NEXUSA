"""Risk Controller
تعیین اندازه پوزیشن، حد ریسک، و سقف اکسپوژر بر اساس سیگنال‌ها و محدودیت‌های پرتفوی.
"""
from typing import Dict, Any

def position_size(score: float, max_risk_per_trade: float = 0.01) -> float:
    """برگرداندن درصد پرتفوی برای تخصیص. score 0..100 → 0..max_risk_per_trade"""
    s = max(0.0, min(100.0, float(score)))
    return (s / 100.0) * max_risk_per_trade

def apply_limits(symbol: str, alloc: float, limits: Dict[str, Any]) -> float:
    sym_cap = float(limits.get("per_symbol_cap", 0.05))
    port_cap = float(limits.get("portfolio_cap", 1.0))
    alloc = min(alloc, sym_cap)
    # در این سطح نمونه، فرض می‌کنیم مجموع قبلی رعایت شده است.
    return min(alloc, port_cap)

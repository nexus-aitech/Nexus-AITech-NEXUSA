"""Rationale Mapper
تبدیل خروجی عددی به توضیح قابل فهم انسان.
"""
from typing import Dict, Any

def map_rationale(signals: Dict[str, Dict[str, Any]], final_score: float) -> str:
    parts = []
    for name, d in signals.items():
        if name == "context":
            continue
        tag = "(blocked)" if d.get("blocked") else ""
        parts.append(f"- {name}{tag}: score={d.get('score')}, note={d.get('rationale', '')}")
    level = "قوی" if final_score >= 70 else ("متوسط" if final_score >= 40 else "ضعیف")
    parts.append(f"جمع‌بندی: سیگنال {level} با امتیاز نهایی {final_score:.1f}/100.")
    return "\n".join(parts)

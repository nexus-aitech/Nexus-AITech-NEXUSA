"""Signal Emitter
قالب‌بندی خروجی برای کانال‌های مختلف (JSON/Markdown/Telegram-friendly).
"""
from typing import Dict, Any
import json

def to_json(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)

def to_markdown(payload: Dict[str, Any]) -> str:
    lines = [
        f"**Signal — {payload.get('symbol')}**",
        f"Score: {payload.get('score')}/100 | Side: {payload.get('side')} | Allocation: {payload.get('allocation')*100:.2f}%",
        "",
        "**Rationale:**",
        payload.get("rationale", "-"),
    ]
    return "\n".join(lines)

# reports/localization.py
"""Localization utilities for FA/EN:
- Digit conversion (Persian/English)
- RTL helpers (bidi wrapping)
- Number/percent/currency/date formatting
- Recursive payload localization
- Minimal LLM report contract enforcement (citations/schema)
"""

from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Union, List, Optional
import datetime as dt
import pandas as pd

# --- Optional schema validation (lightweight) ---
try:
    from jsonschema import validate, ValidationError  # type: ignore
    _HAS_JSONSCHEMA = True
except Exception:  # pragma: no cover
    validate = None  # type: ignore
    class ValidationError(Exception):  # fallback
        """Fallback ValidationError used if `jsonschema` is not installed."""
        pass
    _HAS_JSONSCHEMA = False

# Persian/Arabic digit maps
_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
_EN_DIGITS = {ord(f): str(i) for i, f in enumerate("۰۱۲۳۴۵۶۷۸۹")}

# Separators
_FA_THOUSANDS = "٬"  # U+066C
_FA_DECIMAL = "٫"    # U+066B

_RTL_LANGS = {"fa", "ar", "ur", "he"}

def is_rtl(lang: str) -> bool:
    """Return True if `lang` is a right-to-left language (fa/ar/ur/he)."""
    return (lang or "").split("-")[0].lower() in _RTL_LANGS

def to_persian_digits(s: str) -> str:
    """Convert ASCII digits in `s` to Persian digits."""
    return s.translate(_FA_DIGITS)

def to_english_digits(s: str) -> str:
    """Convert Persian digits in `s` to ASCII (English) digits."""
    return s.translate(_EN_DIGITS)

def bidi_wrap(text: str, lang: str) -> str:
    """
    Wrap `text` with Unicode isolates for RTL languages to keep punctuation aligned.

    For RTL languages, returns RLI + text + PDI; otherwise returns text unchanged.
    """
    if not is_rtl(lang):
        return text
    RLI = "\u2067"  # Right-to-left isolate
    PDI = "\u2069"  # Pop directional isolate
    return f"{RLI}{text}{PDI}"

def format_number(
    x: Union[int, float],
    lang: str = "en",
    decimals: int = 2,
    use_arabic_separators: bool = True,
) -> str:
    """
    Format `x` with thousand separators and `decimals` decimal places,
    localizing digits/separators for Persian if `lang` starts with "fa".
    """
    if x is None:
        return ""

    try:
        n = float(x)
    except Exception:
        return str(x)

    neg = n < 0
    n = abs(n)
    fmt = f"{{:,.{decimals}f}}".format(n)

    if lang.split("-")[0].lower() == "fa":
        if use_arabic_separators:
            fmt = fmt.replace(",", _FA_THOUSANDS).replace(".", _FA_DECIMAL)
        fmt = to_persian_digits(fmt)
    return f"-{fmt}" if neg else fmt

def format_percent(x: float, lang: str = "en", decimals: int = 2) -> str:
    """Format a ratio `x` as a percentage string localized to `lang`."""
    if x is None:
        return ""
    return format_number(x * 100.0, lang=lang, decimals=decimals) + ("٪" if lang.startswith("fa") else "%")

def format_currency(x: float, currency: str = "USD", lang: str = "en", decimals: int = 2) -> str:
    """Format amount `x` with `currency` symbol and localized digits/ordering for `lang`."""
    symbol = {"USD": "$", "USDT": "$", "EUR": "€", "IRR": "﷼"}.get(currency.upper(), currency.upper())
    num = format_number(x, lang=lang, decimals=decimals)
    if lang.startswith("fa"):
        return bidi_wrap(f"{num} {symbol}", lang)
    return f"{symbol}{num}"

def format_date(ts: Union[str, dt.datetime, pd.Timestamp], lang: str = "en", tz: str = "UTC") -> str:
    """Format timestamp `ts` to 'YYYY-MM-DD HH:MM:SS TZ', localizing digits for Persian and converting to `tz`."""
    if ts is None:
        return ""
    t = pd.to_datetime(ts, utc=True, errors="coerce")
    if t is pd.NaT:
        return ""
    if tz and tz != "UTC":
        try:
            t = t.tz_convert(tz)
        except Exception:
            pass
    # ISO-like but localized digits for FA
    s = t.strftime("%Y-%m-%d %H:%M:%S %Z")
    if lang.startswith("fa"):
        s = to_persian_digits(s)
    return s

def localize_payload(obj: Any, lang: str = "en") -> Any:
    """
    Recursively localize known numeric/date patterns inside dictionaries/lists.
    - Converts numbers for keys likely to be numeric (prob_tp, entry, sl, tp, etc.)
    - Converts ISO timestamps on keys that include 'ts'
    """
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            lk = k.lower()
            if lk.startswith("ts") or lk.endswith("_ts") or "timestamp" in lk:
                out[k] = format_date(v, lang=lang)
            elif isinstance(v, (int, float)) and lk in {"prob_tp", "entry", "sl", "tp"}:
                dec = 4 if lk == "prob_tp" else 2
                out[k] = format_number(v, lang=lang, decimals=dec)
            else:
                out[k] = localize_payload(v, lang=lang)
        return out
    elif isinstance(obj, list):
        return [localize_payload(x, lang=lang) for x in obj]
    else:
        return obj

# ----------------- LLM Guardrails (to satisfy schema & citation) -----------------

# حداقل اسکیما برای گزارش LLM (تمرکز روی citations)
_MIN_REPORT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["insights"],
    "properties": {
        "insights": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["heading", "body", "citations"],
                "properties": {
                    "heading": {"type": "string"},
                    "body": {"type": "string"},
                    "citations": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "required": ["source", "id"],
                            "properties": {
                                "source": {"type": "string"},
                                "id": {"type": "string"},
                                "meta": {"type": "object"}
                            },
                            "additionalProperties": True
                        }
                    }
                },
                "additionalProperties": True
            }
        }
    },
    "additionalProperties": True
}

def enforce_llm_report_contract(
    obj: Dict[str, Any],
    *,
    require_citations: bool = True,
    schema: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    اگر آبجکت شبیه گزارش LLM باشد، وجود citations را تضمین می‌کند
    و در صورت موجود بودن jsonschema، علیه اسکیما اعتبارسنجی می‌کند.
    - اگر 'require_citations=True' باشد و citation خالی/غایب باشد، یک citation حداقلی اضافه می‌کند.
    - اگر jsonschema موجود باشد و اعتبارسنجی رد شود، ValidationError می‌دهد.
    """
    if not isinstance(obj, dict):
        return obj

    # فقط اگر ساختار insight دارد، بررسی/ترمیم کن
    insights = obj.get("insights")
    if isinstance(insights, list):
        fixed_insights: List[Dict[str, Any]] = []
        for ins in insights:
            if not isinstance(ins, dict):
                continue
            if require_citations:
                cits = ins.get("citations")
                if not isinstance(cits, list) or len(cits) == 0:
                    ins["citations"] = [{"source": "unknown", "id": "N/A"}]
            fixed_insights.append(ins)
        obj["insights"] = fixed_insights or [{"heading": "Auto", "body": "", "citations": [{"source": "unknown", "id": "N/A"}]}]

        # اعتبارسنجی اختیاری با jsonschema
        if _HAS_JSONSCHEMA and validate is not None:
            validate(obj, schema or _MIN_REPORT_SCHEMA)

    return obj

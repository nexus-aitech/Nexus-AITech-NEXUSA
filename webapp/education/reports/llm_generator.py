# -*- coding: utf-8 -*-
"""
LLM Report Generator — Production-Grade (Global-Ready)

ویژگی‌ها (High-level):
- قالب‌های چندگانه (Executive, Risk, Deep Dive) با پشتیبانی چندزبانه (fa/en)
- خروجی ساختاریافته (JSON Sections) + متن نهایی
- مدیریت خطا و Retry با backoff نمایی
- لاگینگ ساختاریافته JSON + Trace ID/Versioning
- پاکسازی/Redaction ورودی (برای جلوگیری از نشت کلیدها/توکن‌ها)
- محدودسازی/برش ورودی بر اساس بودجه‌ی تقریبی توکن
- سازگاری عقب‌رو با API ساده قبلی (default_template, generate, dummy_llm_call)

بدون وابستگی خارجی (فقط کتابخانه استاندارد پایتون)
"""

from __future__ import annotations
from typing import Callable, Dict, Any, List, Optional, Protocol, Tuple
from dataclasses import dataclass, field, asdict
import datetime as dt
import json
import logging
import re
import time
import uuid

__all__ = [
    "ReportConfig",
    "LLMResponse",
    "LLMClient",
    "ReportResult",
    "LLMReportGenerator",
    "default_template",
    "generate",
    "dummy_llm_call",
    "payload_safe"
]

# -----------------------------
# Logging (JSON structured)
# -----------------------------

class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "ts": dt.datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "extra": getattr(record, "extra", {}),
        }
        return json.dumps(data, ensure_ascii=False)

_logger = logging.getLogger("llm_report_gen")
if not _logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    _logger.addHandler(handler)
    _logger.setLevel(logging.INFO)


# -----------------------------
# Data models
# -----------------------------

@dataclass
class ReportConfig:
    language: str = "fa"               # 'fa' | 'en'
    template_id: str = "executive"     # 'executive' | 'risk' | 'deep_dive'
    temperature: float = 0.2
    max_output_tokens: int = 800       # حداکثر خروجی مورد انتظار
    max_input_tokens: int = 3000       # برش ورودی برای جلوگیری از prompt overflow
    retries: int = 2                   # تعداد تلاش مجدد
    backoff_sec: float = 1.0           # ضریب backoff پایه
    version: str = "1.0.0"
    redact_secrets: bool = True
    trace_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class LLMResponse:
    text: str
    usage: Optional[Dict[str, Any]] = None
    raw: Optional[Dict[str, Any]] = None

class LLMClient(Protocol):
    def __call__(self, prompt: str, **kwargs) -> LLMResponse: ...

@dataclass
class ReportResult:
    sections: Dict[str, Any]           # ساختار استاندارد خروجی (JSON sections)
    text: str                          # متن خلاصه/گزارش
    prompt: str                        # پرامپت استفاده‌شده
    meta: Dict[str, Any]               # متادیتا (symbol/time/version/trace_id/usage)
    raw_llm: Optional[Dict[str, Any]] = None


# -----------------------------
# Utils
# -----------------------------

_SECRET_PATTERNS = [
    re.compile(r"(?:sk|rk|pk)_[A-Za-z0-9]{20,}", re.IGNORECASE),        # کلید شبیه API
    re.compile(r"(?i)api[_-]?key\s*[:=]\s*[A-Za-z0-9\-_\.\+/]{16,}"),   # api key = xxxx
    re.compile(r"(?i)secret\s*[:=]\s*[A-Za-z0-9\-_\.\+/]{16,}"),        # secret = xxxx
]

def _redact(text: str) -> str:
    red = text
    for pat in _SECRET_PATTERNS:
        red = pat.sub("[REDACTED]", red)
    return red

def _approx_token_len(text: str) -> int:
    # تخمین ساده: ~4 کاراکتر به ازای هر توکن (برای GPT-like)
    return max(1, len(text) // 4)

def _truncate_for_budget(s: str, max_tokens: int) -> str:
    if _approx_token_len(s) <= max_tokens:
        return s
    # حول انتهای متن اطلاعات مهم‌تر را حفظ می‌کنیم (payloadها معمولاً آخر پرامپت قرار می‌گیرند)
    target_chars = max_tokens * 4
    head = s[: target_chars // 2]
    tail = s[- target_chars // 2 :]
    return head + "\n\n... [TRUNCATED] ...\n\n" + tail

def _iso_utc() -> str:
    return dt.datetime.utcnow().isoformat() + "Z"


# -----------------------------
# Templates (fa/en)
# -----------------------------

def _json_instruction(language: str) -> str:
    if language == "fa":
        return (
            "فقط و فقط یک شیء JSON معتبر برگردان. کلیدها دقیقاً به این صورت باشند: "
            "`exec_summary` (string)، `key_points` (array of strings)، `risks` (array of strings)، "
            "`scenarios` (array of strings)، `action` (string)، `confidence` (0..1)."
        )
    return (
        "Return a single valid JSON object only. Keys must be exactly: "
        "`exec_summary` (string), `key_points` (array of strings), `risks` (array of strings), "
        "`scenarios` (array of strings), `action` (string), `confidence` (0..1)."
    )

def _system_header(symbol: str, language: str) -> str:
    if language == "fa":
        return f"گزارش VIP — {symbol} — { _iso_utc() }"
    return f"VIP Report — {symbol} — { _iso_utc() }"

def _user_body(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)

def _template_executive(payload: Dict[str, Any], language: str) -> str:
    symbol = payload.get("symbol", "N/A")
    header = _system_header(symbol, language)
    if language == "fa":
        return f"""{header}

شما یک دستیار تحلیل‌گر ارشد هستید. با تکیه بر دادهٔ زیر یک خروجی **کاملاً ساختاریافته** تولید کن:
- خلاصهٔ اجرایی کوتاه
- نکات کلیدی داده
- ریسک‌ها و سناریوهای خلاف فرض
- اقدام پیشنهادی (بدون تضمین)
{_json_instruction(language)}

داده:
{_user_body(payload)}
"""
    else:
        return f"""{header}

You are a senior analyst. Based on the data below, produce a **fully structured** output:
- Brief executive summary
- Key data points
- Risks and counter-scenarios
- Suggested action (no guarantee)
{_json_instruction(language)}

DATA:
{_user_body(payload)}
"""

def _template_risk(payload: Dict[str, Any], language: str) -> str:
    symbol = payload.get("symbol", "N/A")
    header = _system_header(symbol, language)
    if language == "fa":
        return f"""{header}

تمرکز بر **ریسک و اعتبارسنجی سیگنال‌ها**. با توجه به دادهٔ زیر، خروجی JSON استاندارد تولید کن.
حداقل سه ریسک و سه سناریوی خلاف فرض ارائه بده.
{_json_instruction(language)}

داده:
{_user_body(payload)}
"""
    else:
        return f"""{header}

Focus on **risk and signal validation**. Given the data below, return the standard JSON output.
Include at least three risks and three counter-scenarios.
{_json_instruction(language)}

DATA:
{_user_body(payload)}
"""

def _template_deep_dive(payload: Dict[str, Any], language: str) -> str:
    symbol = payload.get("symbol", "N/A")
    header = _system_header(symbol, language)
    if language == "fa":
        return f"""{header}

تحلیل عمیق و بخش‌بندی‌شده ارائه بده. روی پیوند با بنیادها/آنچین/مشتقات و محدودیت‌ها تاکید کن.
{_json_instruction(language)}

داده:
{_user_body(payload)}
"""
    else:
        return f"""{header}

Provide a deep-dive analysis. Emphasize fundamentals/on-chain/derivatives links and limitations.
{_json_instruction(language)}

DATA:
{_user_body(payload)}
"""

_TEMPLATES = {
    ("executive", "fa"): _template_executive,
    ("risk", "fa"): _template_risk,
    ("deep_dive", "fa"): _template_deep_dive,
    ("executive", "en"): _template_executive,
    ("risk", "en"): _template_risk,
    ("deep_dive", "en"): _template_deep_dive,
}


# -----------------------------
# Core generator
# -----------------------------

class LLMReportGenerator:
    def __init__(self, llm_client: LLMClient, config: Optional[ReportConfig] = None):
        self.llm_client = llm_client
        self.config = config or ReportConfig()

    # اصلی‌ترین متد تولید گزارش
    def generate(self, payload: Dict[str, Any]) -> ReportResult:
        cfg = self.config
        # برش و پاکسازی
        safe_payload = json.loads(json.dumps(payload, ensure_ascii=False))  # deep copy
        if cfg.redact_secrets:
            safe_payload = self._redact_payload(safe_payload)

        tmpl_fn = _TEMPLATES.get((cfg.template_id, cfg.language), _template_executive)
        prompt = tmpl_fn(safe_payload, cfg.language)
        prompt = _truncate_for_budget(prompt, cfg.max_input_tokens)

        # Retry با backoff
        last_exc: Optional[Exception] = None
        for attempt in range(cfg.retries + 1):
            try:
                _logger.info("calling llm", extra={
                    "extra": {"trace_id": cfg.trace_id, "attempt": attempt, "template": cfg.template_id, "lang": cfg.language}
                })
                resp = self.llm_client(prompt, temperature=cfg.temperature, max_tokens=cfg.max_output_tokens)
                sections = self._parse_sections(resp.text, cfg.language)
                meta = {
                    "symbol": safe_payload.get("symbol"),
                    "generated_at": _iso_utc(),
                    "version": cfg.version,
                    "trace_id": cfg.trace_id,
                    "usage": getattr(resp, "usage", None),
                    "config": asdict(cfg),
                }
                text = self._compose_text(sections, cfg.language)
                return ReportResult(sections=sections, text=text, prompt=prompt, meta=meta, raw_llm=getattr(resp, "raw", None))
            except Exception as e:
                last_exc = e
                wait = (cfg.backoff_sec * (2 ** attempt))
                _logger.error("llm call failed; backing off", extra={
                    "extra": {"trace_id": cfg.trace_id, "attempt": attempt, "wait_sec": wait, "error": str(e)}
                })
                if attempt < cfg.retries:
                    time.sleep(wait)

        # پس از تمام تلاش‌ها، خطا را بالا می‌دهیم
        raise RuntimeError(f"LLM generation failed after {cfg.retries+1} attempts: {last_exc}")

    # --- Helpers ---
    def _redact_payload(self, p: Dict[str, Any]) -> Dict[str, Any]:
        def _walk(x):
            if isinstance(x, str):
                return _redact(x)
            if isinstance(x, dict):
                return {k: _walk(v) for k, v in x.items()}
            if isinstance(x, list):
                return [_walk(v) for v in x]
            return x
        return _walk(p)

    def _parse_sections(self, text: str, language: str) -> Dict[str, Any]:
        """انتظار JSON معتبر داریم؛ اگر نبود، تلاش برای استخراج JSON؛ وگرنه fallback ساخت متن آزاد."""
        def _load_json(s: str) -> Optional[Dict[str, Any]]:
            try:
                return json.loads(s)
            except Exception:
                return None

        # حالت ایده‌آل: متن تماماً JSON
        j = _load_json(text.strip())
        if j and isinstance(j, dict):
            return self._normalize_sections(j, language)

        # تلاش برای پیدا کردن بلاک JSON
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            j2 = _load_json(m.group(0))
            if j2 and isinstance(j2, dict):
                return self._normalize_sections(j2, language)

        # fallback: ساخت حداقل ساختار
        if language == "fa":
            return {
                "exec_summary": text.strip()[:600],
                "key_points": [],
                "risks": [],
                "scenarios": [],
                "action": "",
                "confidence": None
            }
        else:
            return {
                "exec_summary": text.strip()[:600],
                "key_points": [],
                "risks": [],
                "scenarios": [],
                "action": "",
                "confidence": None
            }

    def _normalize_sections(self, j: Dict[str, Any], language: str) -> Dict[str, Any]:
        # کلیدهای مورد انتظار
        keys = ["exec_summary", "key_points", "risks", "scenarios", "action", "confidence"]
        out = {k: j.get(k) for k in keys}
        # نوع‌دهی حداقلی
        out["exec_summary"] = out.get("exec_summary") or ""
        out["key_points"] = out.get("key_points") or []
        out["risks"] = out.get("risks") or []
        out["scenarios"] = out.get("scenarios") or []
        out["action"] = out.get("action") or ""
        conf = out.get("confidence")
        try:
            out["confidence"] = None if conf is None else float(conf)
        except Exception:
            out["confidence"] = None
        return out

    def _compose_text(self, s: Dict[str, Any], language: str) -> str:
        if language == "fa":
            parts = []
            if s.get("exec_summary"):
                parts.append(f"خلاصه اجرایی:\n{s['exec_summary']}")
            if s.get("key_points"):
                parts.append("نکات کلیدی:\n- " + "\n- ".join(map(str, s["key_points"])))
            if s.get("risks"):
                parts.append("ریسک‌ها:\n- " + "\n- ".join(map(str, s["risks"])))
            if s.get("scenarios"):
                parts.append("سناریوها:\n- " + "\n- ".join(map(str, s["scenarios"])))
            if s.get("action"):
                parts.append(f"اقدام پیشنهادی (بدون تضمین):\n{s['action']}")
            if s.get("confidence") is not None:
                parts.append(f"اعتماد مدل: {round(s['confidence']*100, 1)}٪")
            return "\n\n".join(parts).strip()
        else:
            parts = []
            if s.get("exec_summary"):
                parts.append(f"Executive Summary:\n{s['exec_summary']}")
            if s.get("key_points"):
                parts.append("Key Points:\n- " + "\n- ".join(map(str, s["key_points"])))
            if s.get("risks"):
                parts.append("Risks:\n- " + "\n- ".join(map(str, s["risks"])))
            if s.get("scenarios"):
                parts.append("Scenarios:\n- " + "\n- ".join(map(str, s["scenarios"])))
            if s.get("action"):
                parts.append(f"Suggested Action (no guarantee):\n{s['action']}")
            if s.get("confidence") is not None:
                parts.append(f"Model Confidence: {round(s['confidence']*100, 1)}%")
            return "\n\n".join(parts).strip()


# -----------------------------
# Backward-compatible API
# -----------------------------

def default_template(payload: Dict[str, Any]) -> str:
    """قالب پیش‌فرض (Executive, fa) — برای سازگاری با نسخه‌های قبلی."""
    rc = ReportConfig(language="fa", template_id="executive")
    gen = LLMReportGenerator(_CallableShunt(), rc)
    # فقط ساخت پرامپت (بدون call)
    tmpl_fn = _TEMPLATES.get((rc.template_id, rc.language), _template_executive)
    prompt = tmpl_fn(payload, rc.language)
    return prompt

def generate(payload: Dict[str, Any], llm_call: Callable[[str], str],
             template: Callable[[Dict[str, Any]], str] = default_template) -> str:
    """
    سازگار با امضای قبلی:
    - llm_call: تابعی که فقط prompt را می‌گیرد و متن برمی‌گرداند.
    - خروجی: متن نهایی (fa)
    """
    cfg = ReportConfig(language="fa", template_id="executive")
    def adapter(prompt: str, **kwargs) -> LLMResponse:
        return LLMResponse(text=llm_call(prompt))
    gen = LLMReportGenerator(adapter, cfg)
    result = gen.generate(payload)
    return result.text

def dummy_llm_call(prompt: str) -> str:
    """شبیه‌ساز بدون اتصال اینترنت — خروجی JSON استاندارد تولید می‌کند."""
    data = payload_safe(prompt)
    score = data.get("score", None)
    risk = data.get("risk", {})
    symbol = data.get("symbol", "N/A")
    out = {
        "exec_summary": f"خلاصه ساختگی برای {symbol}؛ امتیاز={score}",
        "key_points": ["این خروجی ساختگی است", "برای تست پایپ‌لاین"],
        "risks": [f"ریسک ساختگی: {risk}"],
        "scenarios": ["سناریوی A: روند خنثی", "سناریوی B: رالی کوتاه‌مدت"],
        "action": "هیچ اقدامی پیشنهاد نمی‌شود (دمو).",
        "confidence": 0.5
    }
    return json.dumps(out, ensure_ascii=False)

def payload_safe(prompt: str) -> Dict[str, Any]:
    """تلاش برای استخراج JSON از prompt جهت تست‌های آفلاین."""
    try:
        m = re.search(r"\{[\s\S]*\}", prompt)
        return json.loads(m.group(0)) if m else {}
    except Exception:
        return {}

# Helper to satisfy typing when we only want to render template in default_template()
class _CallableShunt:
    def __call__(self, prompt: str, **kwargs) -> LLMResponse:
        return LLMResponse(text="")

# reports/llm_generator.py
"""LLM-based report generator with JSON Schema validation and localization helpers.

This module provides:
- A dataclass `LLMGeneratorConfig` for runtime configuration.
- An `LLMGenerator` class that builds a schema-constrained prompt, calls an LLM (or a mock),
  extracts JSON safely, validates/repairs it against a JSON Schema, and localizes output.

Note: Structure and behavior preserved; only documentation/type-hints added to satisfy linters.
"""

from __future__ import annotations
import json
import re
import hashlib
import pandas as pd
from dataclasses import dataclass, field, asdict  # noqa: F401 (asdict/field may be used by consumers)
from typing import Any, Callable, Dict, List, Optional
from localization import localize_payload, bidi_wrap  # noqa: F401 (bidi_wrap exported for downstream usage)

# --- Schema validation (jsonschema) ---
try:
    from jsonschema import validate, ValidationError  # type: ignore
    _HAS_JSONSCHEMA = True
except Exception:  # pragma: no cover
    validate = None  # type: ignore

    class ValidationError(Exception):  # fallback
        """Fallback ValidationError used when `jsonschema` is unavailable."""
        pass

    _HAS_JSONSCHEMA = False

JsonObj = Dict[str, Any]
LLMCallable = Callable[[str], str]


def _stable_hash(obj: Any) -> str:
    """Return a short, deterministic SHA-256 hash (first 16 hex chars) for a JSON-serializable object.

    The object is serialized with stable settings (sorted keys, no ASCII escaping) so the
    same semantic content always maps to the same hash.
    """
    s = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


@dataclass
class LLMGeneratorConfig:
    """Configuration for `LLMGenerator`.

    Attributes:
        provider: Backend provider name (e.g., "openai", "anthropic", "ollama", "mock").
        model: Model identifier for the provider.
        temperature: Sampling temperature.
        max_tokens: Max tokens for generation (hint for the backend).
        schema_version: Version string embedded in outputs for downstream contracts.
        lang: Output language code ("fa" or "en").
        tone: Desired tone ("neutral"|"formal"|"concise"|"analytical").
        force_json: If True, prompt requests strict JSON-only output.
    """
    provider: str = "mock"   # "openai"|"anthropic"|"ollama"|"mock"
    model: str = "gpt-4o-mini"
    temperature: float = 0.3
    max_tokens: int = 1200
    schema_version: str = "2.0.0"
    lang: str = "fa"  # "en" or "fa"
    tone: str = "neutral"  # "neutral"|"formal"|"concise"|"analytical"
    force_json: bool = True


class LLMGenerator:
    """
    LLM report generator with strict JSON schema validation and language/tone controls.
    Expects a callable to actually run the model; defaults to a deterministic mock.
    """

    def __init__(self, cfg: LLMGeneratorConfig, llm_call: Optional[LLMCallable] = None) -> None:
        """Initialize the generator.

        Args:
            cfg: Configuration for generation and validation.
            llm_call: Callable that takes a prompt string and returns raw model text.
                      If None, a deterministic mock is used.
        """
        self.cfg = cfg
        self.llm_call = llm_call or self._mock_llm

    # ---------- Schema ----------
    def schema(self) -> JsonObj:
        """Return the JSON Schema that generated reports must satisfy."""
        return {
            "type": "object",
            "required": ["schema_version","report_id","ts_report","lang","tone","summary","signal","insights"],
            "properties": {
                "schema_version": {"type":"string"},
                "report_id": {"type":"string"},
                "ts_report": {"type":"string"},
                "lang": {"type":"string"},
                "tone": {"type":"string"},
                "summary": {"type":"string"},
                "market_context": {"type":"string"},
                "signal": {
                    "type":"object",
                    "required":["symbol","timeframe","side","prob_tp","entry","sl","tp","model_version"],
                    "properties": {
                        "symbol":{"type":"string"},
                        "timeframe":{"type":"string"},
                        "side":{"type":"string","enum":["LONG","SHORT"]},
                        "prob_tp":{"type":"number"},
                        "entry":{"type":"number"},
                        "sl":{"type":"number"},
                        "tp":{"type":"number"},
                        "model_version":{"type":"string"},
                        "rationale":{"type":"object"},
                    },
                    "additionalProperties": True
                },
                "insights": {
                    "type":"array",
                    "minItems": 1,
                    "items": {
                        "type":"object",
                        "required":["heading","body","citations"],
                        "properties": {
                            "heading":{"type":"string"},
                            "body":{"type":"string"},
                            "citations":{
                                "type":"array",
                                "minItems": 1,
                                "items":{
                                    "type":"object",
                                    "required":["source","id"],
                                    "properties":{
                                        "source":{"type":"string"},
                                        "id":{"type":"string"},
                                        "meta":{"type":"object"}
                                    },
                                    "additionalProperties": True
                                }
                            }
                        },
                        "additionalProperties": True
                    }
                },
                "risk_warnings": {"type":"array","items":{"type":"string"}},
            },
            "additionalProperties": True
        }

    # ---------- Prompt ----------
    def build_prompt(self, signal: JsonObj, citations: List[JsonObj]) -> str:
        """Build a language/tone-aware, schema-embedded prompt for the LLM.

        Args:
            signal: Structured signal payload (symbol, timeframe, side, etc.).
            citations: Evidence list to enforce non-empty citations in insights.

        Returns:
            A single string prompt that asks the model to return JSON only.
        """
        lang = self.cfg.lang
        tone = self.cfg.tone
        schema_str = json.dumps(self.schema(), ensure_ascii=False, indent=2)
        # instruction in the requested language
        if lang.startswith("fa"):
            instr = (
                "شما یک گزارش‌دهنده حرفه‌ای معاملات هستید. بر اساس جزئیات سیگنال و شواهد RAG"
                " یک گزارش تحلیلی تولید کنید. فقط و فقط خروجی JSON مطابق اسکیما تولید کنید؛"
                " متن اضافه ننویسید. لحن: {tone}."
            )
        else:
            instr = (
                "You are a professional trading reporter. Using the signal details and RAG evidence,"
                " produce an analytical report. Output MUST be JSON matching the schema;"
                " do not include any extra text. Tone: {tone}."
            )
        instr = instr.format(tone=tone)

        prompt = (
            f"{instr}\n"
            f"LANG={lang}\n"
            f"SCHEMA_VERSION={self.cfg.schema_version}\n"
            f"SCHEMA:\n{schema_str}\n"
            f"SIGNAL:\n{json.dumps(signal, ensure_ascii=False)}\n"
            f"CITATIONS:\n{json.dumps(citations, ensure_ascii=False)}\n"
            "Return ONLY a compact JSON object."
        )
        return prompt

    # ---------- Generation ----------
    def generate(self, signal: JsonObj, citations: List[JsonObj]) -> JsonObj:
        """Generate a report JSON from `signal` and `citations`, validate, repair, and localize.

        Args:
            signal: Input signal payload.
            citations: Evidence objects for the insight section.

        Returns:
            A schema-conformant JSON object localized per configuration.
        """
        prompt = self.build_prompt(signal, citations)
        raw = self.llm_call(prompt)
        obj = self._extract_json(raw)
        obj = self._validate_and_repair(obj, signal=signal)  # fill defaults, enforce citations
        # final localization
        obj["lang"] = self.cfg.lang
        obj["tone"] = self.cfg.tone
        obj["schema_version"] = self.cfg.schema_version
        obj["report_id"] = obj.get("report_id") or _stable_hash({"signal": signal, "lang": self.cfg.lang})
        obj = localize_payload(obj, lang=self.cfg.lang)
        return obj

    # ---------- Guardrails ----------
    def _extract_json(self, text: str) -> JsonObj:
        """Best-effort JSON extractor: parse directly, from fenced braces, or via quote normalization.

        If all strategies fail, returns a minimal object with `summary` truncated from raw text.
        """
        # Try direct parse
        try:
            return json.loads(text)
        except Exception:
            pass
        # Try fenced block
        m = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
        # Try single quotes -> double
        t2 = text.replace("'", '"')
        try:
            return json.loads(t2)
        except Exception:
            # last resort
            return {"summary": text.strip()[:200]}

    def _validate_and_repair(self, obj: JsonObj, signal: JsonObj) -> JsonObj:
        """
        Fill mandatory defaults, enforce non-empty citations per insight, then validate JSON against schema.
        If validation fails, attempt a minimal repair and validate again; otherwise raise.
        """
        # --- fill defaults ---
        obj = dict(obj)
        obj.setdefault("schema_version", self.cfg.schema_version)
        obj.setdefault("ts_report", pd.Timestamp.utcnow().isoformat())
        obj.setdefault("lang", self.cfg.lang)
        obj.setdefault("tone", self.cfg.tone)

        # ensure signal block
        if "signal" not in obj or not isinstance(obj["signal"], dict):
            obj["signal"] = {k: signal.get(k) for k in ["symbol","timeframe","side","prob_tp","entry","sl","tp","model_version","rationale"]}

        # ensure insights list
        if "insights" not in obj or not isinstance(obj["insights"], list):
            obj["insights"] = []

        # ensure at least one insight exists
        if not obj["insights"]:
            obj["insights"] = [{
                "heading": "Auto-generated",
                "body": (
                    "خلاصهٔ خودکار بر اساس سیگنال."
                    if self.cfg.lang.startswith("fa")
                    else "Auto summary based on signal."
                ),
                "citations": [{
                    "source": "signal",
                    "id": _stable_hash(signal)
                }]
            }]

        # enforce non-empty citations per insight
        for ins in obj.get("insights", []):
            if not isinstance(ins, dict):
                continue
            cits = ins.get("citations")
            if not isinstance(cits, list) or len(cits) == 0:
                ins["citations"] = [{
                    "source": "signal",
                    "id": _stable_hash({"sym": signal.get("symbol"), "tf": signal.get("timeframe")})
                }]

        # ensure summary
        if "summary" not in obj or not isinstance(obj["summary"], str):
            side = signal.get("side", "?")
            sym = signal.get("symbol", "?")
            prob = signal.get("prob_tp", 0.0)
            obj["summary"] = (
                f"Signal {side} on {sym} with P(TP)={float(prob):.2f}."
                if not self.cfg.lang.startswith("fa")
                else f"سیگنال {side} برای {sym} با احتمال موفقیت {float(prob):.2f}."
            )

        # --- validate against JSON schema ---
        if _HAS_JSONSCHEMA and validate is not None:
            try:
                validate(obj, self.schema())
            except ValidationError as e:
                # minimal second pass repair
                if "insights" in obj:
                    obj["insights"] = [
                        i for i in obj["insights"]
                        if isinstance(i, dict) and i.get("heading") and i.get("body")
                    ] or [{
                        "heading": "Auto-generated",
                        "body": obj.get("summary", ""),
                        "citations": [{"source":"signal","id":_stable_hash(signal)}]
                    }]
                # re-validate
                validate(obj, self.schema())
        # If jsonschema is unavailable, we at least return a well-formed object per our logic above
        return obj

    # ---------- Mock LLM ----------
    def _mock_llm(self, prompt: str) -> str:
        """Deterministic mock backend: parses SIGNAL/CITATIONS from the prompt and returns schema-compliant JSON."""
        try:
            data = json.loads(prompt.split("SIGNAL:\n",1)[1].split("\nCITATIONS:",1)[0])
            provided_citations = json.loads(prompt.split("CITATIONS:\n",1)[1].split("\nReturn ONLY",1)[0])
        except Exception:
            data = {}
            provided_citations = []

        # ensure at least one citation
        if not isinstance(provided_citations, list) or len(provided_citations) == 0:
            provided_citations = [{"source": "signal", "id": _stable_hash(data)}]

        # deterministic, schema-compliant JSON
        out = {
            "schema_version": self.cfg.schema_version,
            "report_id": _stable_hash(data),
            "ts_report": pd.Timestamp.utcnow().isoformat(),
            "lang": self.cfg.lang,
            "tone": self.cfg.tone,
            "summary": (
                "سیگنال {} برای {} در تایم‌فریم {} با احتمال موفقیت {:.2f}."
                if self.cfg.lang.startswith("fa")
                else "Signal {} on {} ({} timeframe) with success probability {:.2f}."
            ).format(data.get("side","?"), data.get("symbol","?"), data.get("timeframe","?"), float(data.get("prob_tp",0.0))),
            "market_context": "נوسانات اخیر و رفتار حجم بررسی شد." if self.cfg.lang.startswith("fa") else "Recent volatility and volume behavior reviewed.",
            "signal": {
                "symbol": data.get("symbol"),
                "timeframe": data.get("timeframe"),
                "side": data.get("side"),
                "prob_tp": float(data.get("prob_tp", 0.0)),
                "entry": float(data.get("entry", 0.0)),
                "sl": float(data.get("sl", 0.0)),
                "tp": float(data.get("tp", 0.0)),
                "model_version": data.get("model_version",""),
                "rationale": data.get("rationale", {}),
            },
            "insights": [
                {
                    "heading": "Momentum/Volatility",
                    "body": "ADX و ATR سطوح ریسک را نشان می‌دهند." if self.cfg.lang.startswith("fa") else "ADX and ATR indicate risk regimes.",
                    "citations": list(provided_citations)
                },
                {
                    "heading": "Liquidity",
                    "body": "VWAP/OBV جهت‌گیری جریان سفارش را حمایت می‌کند." if self.cfg.lang.startswith("fa") else "VWAP/OBV support order-flow bias.",
                    "citations": list(provided_citations)
                },
            ],
            "risk_warnings": [
                "این گزارش توصیه سرمایه‌گذاری نیست." if self.cfg.lang.startswith("fa") else "This report is not investment advice."
            ]
        }
        return json.dumps(out, ensure_ascii=False, separators=(",",":"))

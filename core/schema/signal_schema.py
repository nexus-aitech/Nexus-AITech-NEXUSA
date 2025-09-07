"""
JSON Schema definitions for trading signals in NEXUSA.

- Version: 2
- Name: "signal"
- Purpose: validate signal messages (id, symbol, tf, score, direction, entries, SL/TP, etc.)
"""

SIGNAL_SCHEMA_V = "2"
SIGNAL_SCHEMA_NAME = "signal"

SIGNAL_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Signal v2",
  "type": "object",
  "required": ["signal_id","symbol","tf","score","direction","created_at"],
  "properties": {
    "signal_id": {"type":"string"},
    "symbol": {"type":"string"},
    "tf": {"type":"string"},
    "score": {"type":"number","minimum": -1.0, "maximum": 1.0},
    "direction": {"enum": ["Long","Short","Neutral"]},
    "entry": {"type":"array","items":{"type":"number"}},
    "stop_loss": {"type":"number"},
    "take_profit": {"type":"array","items":{"type":"number"}},
    "confidence": {"type":"number","minimum": 0.0, "maximum": 1.0},
    "model_id": {"type":"string"},
    "created_at": {"type":"string"},
    "rationale_id": {"type":"string"}
  },
  "additionalProperties": False
}

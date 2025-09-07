"""
JSON Schema definitions for feature rows used across NEXUSA pipelines.

- Version: 2
- Name: "features"
- Purpose: validate per-row computed indicators (e.g., adx, atr, vwap) alongside
  symbol/timeframe/timestamp metadata, while allowing extra indicators via
  `additionalProperties` inside the `indicators` object.
"""
# Source basis: :contentReference[oaicite:0]{index=0}

FEATURE_SCHEMA_V = "2"
FEATURE_SCHEMA_NAME = "features"

FEATURE_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Feature Row v2",
  "type": "object",
  "required": ["symbol","tf","timestamp","indicators"],
  "properties": {
    "symbol": {"type": "string"},
    "tf": {"type": "string"},
    "timestamp": {"type": "integer"},
    "indicators": {
      "type": "object",
      "properties": {
        "adx": {"type":"number"},
        "atr": {"type":"number"},
        "vwap": {"type":"number"}
      },
      "additionalProperties": True
    }
  },
  "additionalProperties": False
}

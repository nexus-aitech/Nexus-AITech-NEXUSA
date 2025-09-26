from .base import ExchangeAdapter

class BybitAdapter(ExchangeAdapter):
    WS_URL = "wss://stream.bybit.com/v5/public/linear"

    def subscribe(self, symbol: str, tf: str):
        return {"op": "subscribe", "args": [f"kline.{tf}.{symbol}"]}

    def parse_message(self, msg: dict) -> dict:
        data = msg.get("data", [])[0]
        return {
            "symbol": data.get("symbol"),
            "tf": data.get("interval"),
            "open": float(data.get("open")),
            "high": float(data.get("high")),
            "low": float(data.get("low")),
            "close": float(data.get("close")),
            "volume": float(data.get("volume")),
            "ts": data.get("start")
        }

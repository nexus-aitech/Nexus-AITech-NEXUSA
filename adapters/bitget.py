from .base import ExchangeAdapter

class BitgetAdapter(ExchangeAdapter):
    WS_URL = "wss://ws.bitget.com/spot/v1/stream"

    def subscribe(self, symbol: str, tf: str):
        return {"op": "subscribe", "args": [f"candle{tf}:{symbol}"]}

    def parse_message(self, msg: dict) -> dict:
        data = msg.get("data", [])[0]
        return {
            "symbol": msg.get("arg", {}).get("instId"),
            "tf": msg.get("arg", {}).get("channel").replace("candle", ""),
            "open": float(data[1]),
            "high": float(data[2]),
            "low": float(data[3]),
            "close": float(data[4]),
            "volume": float(data[5]),
            "ts": int(data[0])
        }

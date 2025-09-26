from .base import ExchangeAdapter

class BingxAdapter(ExchangeAdapter):
    WS_URL = "wss://open-api-ws.bingx.com/market"

    def subscribe(self, symbol: str, tf: str):
        return {"id": 1, "method": "SUBSCRIBE", "params": [f"{symbol.lower()}@kline_{tf}"]}

    def parse_message(self, msg: dict) -> dict:
        k = msg.get("k", {})
        return {
            "symbol": msg.get("s"),
            "tf": k.get("i"),
            "open": float(k.get("o")),
            "high": float(k.get("h")),
            "low": float(k.get("l")),
            "close": float(k.get("c")),
            "volume": float(k.get("v")),
            "ts": k.get("t")
        }

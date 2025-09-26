from .base import ExchangeAdapter

class BinanceAdapter(ExchangeAdapter):
    WS_URL = "wss://stream.binance.com:9443/ws"

    def subscribe(self, symbol: str, tf: str):
        return {
            "method": "SUBSCRIBE",
            "params": [f"{symbol.lower()}@kline_{tf}"],
            "id": 1
        }

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

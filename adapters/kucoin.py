from .base import ExchangeAdapter

class KucoinAdapter(ExchangeAdapter):
    WS_URL = "wss://ws-api-spot.kucoin.com/"

    def subscribe(self, symbol: str, tf: str):
        return {
            "id": 1,
            "type": "subscribe",
            "topic": f"/market/candles:{symbol}_{tf}"
        }

    def parse_message(self, msg: dict) -> dict:
        data = msg.get("data", [])
        return {
            "symbol": msg.get("subject"),
            "tf": msg.get("topic").split(":")[-1].split("_")[-1],
            "open": float(data[1]),
            "high": float(data[3]),
            "low": float(data[4]),
            "close": float(data[2]),
            "volume": float(data[5]),
            "ts": data[0]
        }

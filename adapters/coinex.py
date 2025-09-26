from .base import ExchangeAdapter

class CoinexAdapter(ExchangeAdapter):
    WS_URL = "wss://socket.coinex.com/"

    def subscribe(self, symbol: str, tf: str):
        return {
            "method": "kline.subscribe",
            "params": [symbol, tf],
            "id": 1
        }

    def parse_message(self, msg: dict) -> dict:
        data = msg.get("params", [])[1]
        return {
            "symbol": msg.get("params", [])[0],
            "tf": msg.get("params", [])[1],
            "open": float(data[1]),
            "high": float(data[3]),
            "low": float(data[4]),
            "close": float(data[2]),
            "volume": float(data[5]),
            "ts": data[0]
        }

# storage/tsdb_reader.py

from typing import Optional, Literal
import pandas as pd
from clickhouse_driver import Client, errors as ch_errors
from core.config.config import settings
import logging

logger = logging.getLogger(__name__)

class SignalReader:
    def __init__(self):
        try:
            self.client = Client(
                host=settings.clickhouse.host,
                port=int(settings.clickhouse.port),
                user=settings.clickhouse.user,
                password=settings.clickhouse.password,
                database=settings.clickhouse.db,  # دقت کن: باید `db` باشه نه `database`
            )
        except ch_errors.Error as e:
            logger.exception("Failed to connect to ClickHouse.")
            raise RuntimeError(f"[ClickHouse Connection Error] {e}") from e

    def get_signals(
        self,
        symbol: str = "BTCUSDT",
        tf: Literal["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h","1d"] = "1h",
        limit: int = 100,
    ) -> pd.DataFrame:
        query = """
            SELECT 
                symbol,
                tf,
                side AS direction,
                strength AS score,
                toString(ts) AS created_at
            FROM signals_v2
            WHERE symbol = %(symbol)s AND tf = %(tf)s
            ORDER BY ts DESC
            LIMIT %(limit)s
        """

        try:
            result = self.client.execute(
                query,
                {"symbol": symbol, "tf": tf, "limit": limit}
            )
        except ch_errors.Error as e:
            logger.exception("Failed to execute query on ClickHouse.")
            raise RuntimeError(f"[ClickHouse Query Error] {e}") from e

        if not result:
            logger.warning(f"No signals found for {symbol} - {tf}")
            return pd.DataFrame(columns=["symbol", "tf", "direction", "score", "created_at"])

        df = pd.DataFrame(
            result,
            columns=["symbol", "tf", "direction", "score", "created_at"]
        )
        return df

# نمونه استفاده (می‌تونی در تست جداگانه یا API handler استفاده کنی)
if __name__ == "__main__":
    reader = SignalReader()
    df = reader.get_signals(symbol="ETHUSDT", tf="1h", limit=5)
    print(df)

reader = SignalReader()
get_signals = reader.get_signals

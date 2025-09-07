# -*- coding: utf-8 -*-
"""
Feature Store
=============
دو بخش اصلی:
1) OfflineFeatureStore: نوشتن سری‌های فیچر روی دیسک (Parquet/CSV fallback) با چیدمان پارتیشنی.
2) OnlineFeatureStore: کش درون‌حافظه‌ای + Redis برای دریافت آخرین ردیف فیچر به‌صورت سریع.

طرح مسیر آفلاین:
    root/symbol=SYM/timeframe=TF/date=YYYY-MM-DD/part-0.parquet

کلیدهای آنلاین (Redis):
    feat:{symbol}:{timeframe}
"""

from __future__ import annotations
import os
import json
import logging
import pandas as pd
import redis
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence
from core.config.config import settings

try:
    import pyarrow as pa  # noqa: F401
    import pyarrow.parquet as pq  # noqa: F401
    _HAS_ARROW = True
except Exception:
    _HAS_ARROW = False

log = logging.getLogger("feature_store")


@dataclass
class FeatureRecord:
    """رکورد یک ردیف فیچر برای ذخیره‌سازی یا تبادل.

    Attributes
    ----------
    symbol : str
        نماد دارایی (مثل 'BTCUSDT').
    timeframe : str
        تایم‌فریم (مثل '1h').
    ts_event : pd.Timestamp
        زمان رخداد (UTC).
    features : Dict[str, float]
        نگاشت نام فیچر به مقدار آن.
    """
    symbol: str
    timeframe: str
    ts_event: pd.Timestamp
    features: Dict[str, float]


class OfflineFeatureStore:
    """
    انبارهٔ آفلاین برای نوشتن DataFrame فیچر روی دیسک (Parquet در صورت وجود Arrow، وگرنه CSV).

    Layout:
        root/symbol=SYM/timeframe=TF/date=YYYY-MM-DD/part-0.parquet
    """
    def __init__(self, root: str = "/mnt/data/feature_store") -> None:
        """سازندهٔ انبارهٔ آفلاین.

        Parameters
        ----------
        root : str, default "/mnt/data/feature_store"
            مسیر ریشهٔ ذخیره‌سازی.
        """
        self.root = root
        os.makedirs(self.root, exist_ok=True)

    def _path(self, symbol: str, timeframe: str, date: pd.Timestamp) -> str:
        """مسیر مقصد فایل پارتیشن را بر اساس نماد/تایم‌فریم/تاریخ می‌سازد.

        Parameters
        ----------
        symbol : str
            نماد دارایی.
        timeframe : str
            تایم‌فریم.
        date : pd.Timestamp
            تاریخ (به روز) برای پارتیشن.

        Returns
        -------
        str
            مسیر فایل مقصد (با ساخت دایرکتوری‌های لازم).
        """
        d = pd.to_datetime(date).strftime("%Y-%m-%d")
        path = os.path.join(self.root, f"symbol={symbol}", f"timeframe={timeframe}", f"date={d}")
        os.makedirs(path, exist_ok=True)
        return os.path.join(path, "part-0.parquet")

    def write_batch(self, df: pd.DataFrame) -> str:
        """نوشتن یک دسته از ردیف‌های فیچر در فایل پارتیشنِ روز.

        الزامات ستون‌ها: شامل 'symbol', 'timeframe', 'ts_event'

        Parameters
        ----------
        df : pd.DataFrame
            دیتافریم فیچرها.

        Returns
        -------
        str
            مسیر فایلی که نوشته شد (parquet یا csv).

        Raises
        ------
        KeyError
            اگر ستون‌های ضروری یافت نشوند.
        """
        if not {"symbol", "timeframe", "ts_event"}.issubset(df.columns):
            raise KeyError("DataFrame must include columns: symbol, timeframe, ts_event")
        date = pd.to_datetime(df["ts_event"].iloc[0]).normalize()
        symbol = str(df["symbol"].iloc[0])
        timeframe = str(df["timeframe"].iloc[0])
        dest = self._path(symbol, timeframe, date)
        if _HAS_ARROW:
            df.to_parquet(dest, index=False)
        else:
            # fallback to CSV
            dest = dest.replace(".parquet", ".csv")
            df.to_csv(dest, index=False)
        return dest

    def read_range(
        self,
        symbol: str,
        timeframe: str,
        start: str,
        end: str,
        columns: Optional[Sequence[str]] = None
    ) -> pd.DataFrame:
        """خواندن بازه‌ای از پارتیشن‌ها بین تاریخ‌های داده‌شده (شامل ابتدا و انتها).

        Parameters
        ----------
        symbol : str
            نماد دارایی.
        timeframe : str
            تایم‌فریم.
        start : str
            تاریخ شروع (قابل پارس توسط pandas).
        end : str
            تاریخ پایان (قابل پارس توسط pandas).
        columns : Optional[Sequence[str]]
            زیرمجموعهٔ ستون‌های موردنیاز (برای بهبود کارایی).

        Returns
        -------
        pd.DataFrame
            دیتافریم کانکات‌شده از پارتیشن‌های منطبق؛ یا DataFrame خالی اگر چیزی نبود.
        """
        start_d = pd.to_datetime(start).date()
        end_d = pd.to_datetime(end).date()
        rows: List[pd.DataFrame] = []
        sym_dir = os.path.join(self.root, f"symbol={symbol}", f"timeframe={timeframe}")
        if not os.path.isdir(sym_dir):
            return pd.DataFrame()

        for d in sorted(os.listdir(sym_dir)):
            if not d.startswith("date="):
                continue
            cur = pd.to_datetime(d.split("=", 1)[1]).date()
            if start_d <= cur <= end_d:
                part = os.path.join(sym_dir, d, "part-0.parquet")
                csv = part.replace(".parquet", ".csv")
                if os.path.exists(part):
                    rows.append(pd.read_parquet(part, columns=columns))
                elif os.path.exists(csv):
                    df = pd.read_csv(csv)
                    if columns:
                        df = df[list(columns)]
                    rows.append(df)

        return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()


class OnlineFeatureStore:
    """
    کش آنلاین حداقلی (in-memory) با پشتیبان Redis برای دریافت آخرین ردیف فیچر.

    کلیدها:
        feat:{symbol}:{timeframe}
    """
    def __init__(self) -> None:
        """سازندهٔ کش آنلاین."""
        self._cache: Dict[tuple, Dict[str, float]] = {}
        self._redis: Optional[redis.Redis] = None

    def _get_redis(self) -> redis.Redis:
        """ایجاد/برگشت اتصال Redis بر اساس تنظیمات سیستم.

        Returns
        -------
        redis.Redis
            کلاینت Redis آمادهٔ استفاده.
        """
        if self._redis is None:
            self._redis = redis.from_url(settings.redis.url)
        return self._redis

    def put(self, symbol: str, timeframe: str, feature_row: Dict[str, float]) -> None:
        """قراردادن آخرین ردیف فیچر در کش و Redis.

        Parameters
        ----------
        symbol : str
            نماد دارایی.
        timeframe : str
            تایم‌فریم.
        feature_row : Dict[str, float]
            نگاشت نام فیچر به مقدار (آخرین مشاهده).
        """
        # in-memory
        self._cache[(symbol, timeframe)] = feature_row
        # redis
        key = f"feat:{symbol}:{timeframe}"
        try:
            self._get_redis().set(key, json.dumps(feature_row))
        except Exception as e:
            log.warning("Failed to store in Redis: %s", e)

    def get_latest(
        self, symbol: str, timeframe: str, keys: Optional[Sequence[str]] = None
    ) -> Optional[Dict[str, float]]:
        """واکشی آخرین ردیف فیچر از کش یا Redis.

        Parameters
        ----------
        symbol : str
            نماد دارایی.
        timeframe : str
            تایم‌فریم.
        keys : Optional[Sequence[str]]
            اگر داده شود، فقط همان کلیدهای فیچر برگردانده می‌شوند.

        Returns
        -------
        Optional[Dict[str, float]]
            نگاشت فیچرها یا None در صورت نبود داده.
        """
        row = self._cache.get((symbol, timeframe))
        if row is None:
            try:
                val = self._get_redis().get(f"feat:{symbol}:{timeframe}")
                if val:
                    row = json.loads(val)
                    self._cache[(symbol, timeframe)] = row
            except Exception as e:
                log.warning("Failed to read from Redis: %s", e)
                return None
        if row is None:
            return None
        if keys:
            return {k: row.get(k) for k in keys}
        return row.copy()


def read_latest_feature(symbol: str, timeframe: str, keys: Optional[Sequence[str]] = None) -> Optional[Dict[str, float]]:
    """
    Wrapper برای واکشی آخرین ردیف فیچر از OnlineFeatureStore.

    Parameters
    ----------
    symbol : str
        نماد دارایی.
    timeframe : str
        تایم‌فریم.
    keys : Optional[Sequence[str]]
        اگر داده شود، فقط همان کلیدهای فیچر برگردانده می‌شوند.

    Returns
    -------
    Optional[Dict[str, float]]
        نگاشت فیچرها یا None در صورت نبود داده.
    """
    store = OnlineFeatureStore()
    return store.get_latest(symbol, timeframe, keys)

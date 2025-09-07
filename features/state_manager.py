# -*- coding: utf-8 -*-
"""
State Manager
=============
مدیریت وضعیت سری‌ها برای هر (symbol, timeframe) با دو حالت پنجره:
- sliding: همواره آخرین پنجره را برمی‌گرداند.
- tumbling: تا رسیدن به «slide» انباشت می‌کند، سپس پنجره را خروجی داده و بافر را خالی می‌کند.

همهٔ ردیف‌ها باید کلیدهای 'ts_event', 'symbol', 'timeframe' را داشته باشند.
"""

from __future__ import annotations
import pandas as pd
import redis
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Optional, Literal
from core.config.config import settings

WindowMode = Literal["sliding", "tumbling"]


@dataclass
class SeriesState:
    """نگهدارندهٔ بافر سری برای یک جریان خاص.

    Attributes
    ----------
    maxlen : int
        حداکثر طول بافر (اندازهٔ پنجره).
    buffer : Deque[dict]
        صفِ داده‌های دریافتی به ترتیب زمان.
    count_since_emit : int
        شمارندهٔ ردیف‌ها از آخرین انتشار (برای حالت tumbling).
    """
    maxlen: int
    buffer: Deque[dict] = field(default_factory=deque)
    count_since_emit: int = 0  # only for tumbling mode

    def append(self, row: dict) -> None:
        """افزودن یک ردیف جدید به بافر با رعایت حدّاکثر طول."""
        self.buffer.append(row)
        if self.maxlen and len(self.buffer) > self.maxlen:
            self.buffer.popleft()

    def to_frame(self) -> pd.DataFrame:
        """تبدیل محتوای بافر به DataFrame (در صورت خالی‌بودن، DataFrame خالی)."""
        if not self.buffer:
            return pd.DataFrame()
        return pd.DataFrame(list(self.buffer))


class StateManager:
    """
    نگهداشت وضعیت به‌ازای کلید (symbol, timeframe) با semantics نوع پنجره.

    - sliding: همیشه پنجرهٔ جاری را به‌صورت DataFrame بازمی‌گرداند.
    - tumbling: تا رسیدن به مقدار `slide` انباشت می‌کند؛ سپس همان پنجره را برمی‌گرداند و بافر را خالی می‌کند.
    """

    def __init__(self) -> None:
        """سازندهٔ StateManager؛ ساخت ساختارهای درون‌حافظه و اتصال Redis تنبل (lazy)."""
        self._states: Dict[tuple, SeriesState] = {}
        self._modes: Dict[tuple, WindowMode] = {}
        self._slide: Dict[tuple, int] = {}
        self._redis: Optional[redis.Redis] = None

    def _get_redis(self) -> redis.Redis:
        """ایجاد یا برگشت کلاینت Redis بر اساس settings سیستم."""
        if self._redis is None:
            self._redis = redis.from_url(settings.redis.url)
        return self._redis

    def configure_stream(
        self,
        symbol: str,
        timeframe: str,
        window: int,
        mode: WindowMode = "sliding",
        slide: int = 1
    ) -> None:
        """پیکربندی جریان داده برای کلید (symbol, timeframe).

        Parameters
        ----------
        symbol : str
            نماد دارایی.
        timeframe : str
            تایم‌فریم.
        window : int
            اندازهٔ پنجره (maxlen بافر).
        mode : WindowMode, default "sliding"
            حالت پنجره (sliding یا tumbling).
        slide : int, default 1
            در حالت tumbling تعداد ردیف تا انتشار پنجره.
        """
        key = (symbol, timeframe)
        self._states[key] = SeriesState(maxlen=window)
        self._modes[key] = mode
        self._slide[key] = max(1, int(slide))

    def update(self, row: dict) -> Optional[pd.DataFrame]:
        """به‌روزرسانی جریان با یک ردیف جدید و برگرداندن خروجی پنجره در صورت لزوم.

        در حالت sliding:
            همواره DataFrame پنجرهٔ جاری برگردانده می‌شود.
        در حالت tumbling:
            فقط زمانی DataFrame بازگردانده می‌شود که شمارنده به `slide` برسد
            و طول بافر حداقل به اندازهٔ پنجره باشد؛ سپس بافر خالی می‌شود.
        """
        symbol = row.get("symbol")
        timeframe = row.get("timeframe")
        key = (symbol, timeframe)
        state = self._states.get(key)
        if state is None:
            raise KeyError(f"Unconfigured stream for key={key}. Call configure_stream first.")

        mode = self._modes[key]
        slide = self._slide[key]
        state.append(row)

        if mode == "sliding":
            return state.to_frame()
        else:  # tumbling
            state.count_since_emit += 1
            if state.count_since_emit >= slide and len(state.buffer) >= state.maxlen:
                state.count_since_emit = 0
                frame = state.to_frame().copy()
                state.buffer.clear()  # reset tumbling window
                return frame
            return None

    # ---- Offsets (Redis-backed) ----
    def commit_offset(self, stream: str, ts: int) -> None:
        """ثبت آخرین timestamp پردازش‌شده برای جریان مشخص در Redis."""
        r = self._get_redis()
        r.set(f"offset:{stream}", ts)

    def read_offset(self, stream: str) -> Optional[int]:
        """خواندن آخرین timestamp پردازش‌شده برای یک جریان از Redis (در صورت نبود None)."""
        r = self._get_redis()
        v = r.get(f"offset:{stream}")
        return int(v) if v else None

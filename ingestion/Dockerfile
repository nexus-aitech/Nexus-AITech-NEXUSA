# نسخه پایتون هم بهتره 3.10 باشه چون pandas-ta بهش گیر نمی‌ده
FROM python:3.10-slim AS builder

WORKDIR /app

COPY requirements.txt .

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && python -m pip install --upgrade pip \
    && pip install --prefix=/install -r requirements.txt \
    && rm -rf /var/lib/apt/lists/*

# کپی کل کد پروژه
COPY . .

FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .

CMD ["python", "main.py"]

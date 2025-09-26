FROM python:3.11-slim

WORKDIR /app

# کپی requirements
COPY ingestion/requirements.txt .

# نصب dependency ها
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && python -m pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "ccxt>=4.0.0" \
    && pip install --no-cache-dir git+https://github.com/twopirllc/pandas-ta.git@main \
    && rm -rf /var/lib/apt/lists/*

# کپی سورس کد ingestion
COPY ingestion /app/ingestion

CMD ["python", "-m", "ingestion.rest_fetcher"]

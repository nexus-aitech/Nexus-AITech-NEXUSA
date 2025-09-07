FROM python:3.11-slim AS builder
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --upgrade pip && \
    pip install --prefix=/install -r requirements.txt
COPY . .

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN useradd -u 1001 -m appuser
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .
RUN chown -R appuser:appuser /app
USER 1001

ENV APP_PORT=8000 \
    APP_MODULE=services.recommender.app:app \
    HEALTH_PATH=/health

EXPOSE ${APP_PORT}
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD \
  python -c "import os,sys,urllib.request;port=os.getenv('APP_PORT','8000');path=os.getenv('HEALTH_PATH','/health');url=f'http://127.0.0.1:{port}{path}';\
  sys.exit(0) if urllib.request.urlopen(url,timeout=2).status==200 else sys.exit(1)" || exit 1

CMD ["sh","-c","uvicorn ${APP_MODULE} --host 0.0.0.0 --port ${APP_PORT}"]

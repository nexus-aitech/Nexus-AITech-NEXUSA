# Multi-stage, non-root, healthcheck
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Create non-root user and install curl
RUN adduser --uid 10001 --disabled-password --gecos "" app && \
    apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install JupyterLab
RUN pip install --no-cache-dir jupyterlab==4.2.5

# Copy health check script
COPY ./healthz.sh /usr/local/bin/healthz
RUN chmod +x /usr/local/bin/healthz && chown -R app:app /app

# Switch to non-root user
USER 10001

EXPOSE 8888

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD ["/usr/local/bin/healthz"]

# Run JupyterLab
CMD ["jupyter", "lab", "--ip=0.0.0.0", "--no-browser", "--NotebookApp.token="]

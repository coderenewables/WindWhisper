# ---------- Stage 1: Build ----------
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY app/ app/

RUN pip install --no-cache-dir --prefix=/install .

# ---------- Stage 2: Runtime ----------
FROM python:3.11-slim

LABEL maintainer="GoKaatru Contributors"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 && \
    rm -rf /var/lib/apt/lists/* && \
    addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser

COPY --from=builder /install /usr/local
COPY alembic.ini ./
COPY alembic/ alembic/
COPY app/ app/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

USER appuser

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]

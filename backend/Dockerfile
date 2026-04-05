FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv
RUN pip install uv

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Sync production dependencies
RUN uv sync --no-dev

# Copy application code
COPY app/ app/
COPY run_agent.py ./

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

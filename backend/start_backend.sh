#!/bin/bash
# Start the backend API server with virtual environment activated

cd "$(dirname "$0")"

# Activate virtual environment
source .venv/bin/activate

# Start uvicorn
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

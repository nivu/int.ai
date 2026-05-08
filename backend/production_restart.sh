#!/bin/bash
# Production-ready restart script for Celery worker
# Works on Railway, Heroku, and other cloud platforms

set -e

echo "🚀 Production Celery Worker Restart"
echo "===================================="

# Kill all existing worker processes
echo "Stopping existing workers..."
pkill -9 -f "celery.*app.worker" 2>/dev/null || true
pkill -9 -f "start_worker_with_cron" 2>/dev/null || true
sleep 2

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# For production (Railway/Heroku), use the system Python
# For local, try to use venv if it exists
if [ -n "$RAILWAY_ENVIRONMENT" ] || [ -n "$DYNO" ]; then
    echo "📦 Production environment detected"
    PYTHON_CMD="python"
else
    echo "💻 Local environment detected"
    if [ -f ".venv/bin/python" ]; then
        PYTHON_CMD=".venv/bin/python"
    else
        PYTHON_CMD="python3"
    fi
fi

echo "Using Python: $PYTHON_CMD"

# Start the worker with auto-restart manager
echo "Starting worker with daily auto-restart..."
nohup $PYTHON_CMD start_worker_with_cron.py > worker.log 2>&1 &
MANAGER_PID=$!

echo "Manager started with PID: $MANAGER_PID"
sleep 5

# Verify it's running
if ps -p $MANAGER_PID > /dev/null 2>&1; then
    if pgrep -f "celery.*app.worker" > /dev/null 2>&1; then
        CELERY_PID=$(pgrep -f "celery.*app.worker")
        echo ""
        echo "✅ SUCCESS! Worker is running"
        echo "   Manager PID: $MANAGER_PID"
        echo "   Celery PID: $CELERY_PID"
        echo ""
        echo "🔄 Auto-restart: Daily at 3:00 AM"
        echo "📋 Logs: tail -f $SCRIPT_DIR/worker.log"
    else
        echo "⚠️  Manager running but Celery not started yet"
        echo "Check logs: tail -f $SCRIPT_DIR/worker.log"
    fi
else
    echo "❌ Failed to start. Check logs:"
    tail -30 "$SCRIPT_DIR/worker.log"
    exit 1
fi

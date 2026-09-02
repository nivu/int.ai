#!/bin/bash
# Simplest restart script - runs celery directly

echo "🔄 Restarting Celery Worker (Simple Mode)..."

# Stop existing worker
echo "Stopping existing worker processes..."
pkill -9 -f "celery.*app.worker" 2>/dev/null || echo "No existing worker found"
pkill -9 -f "start_worker_with_cron" 2>/dev/null
sleep 2

# Navigate to backend directory
cd "$(dirname "$0")"

# Start worker directly with uv run celery
echo "Starting worker..."
nohup uv run --no-sync celery -A app.worker worker --loglevel=info --concurrency=4 > worker.log 2>&1 &
WORKER_PID=$!

sleep 3

# Check if it's running
if ps -p $WORKER_PID > /dev/null 2>&1; then
    echo "✅ Worker started successfully with PID: $WORKER_PID"
    echo "📋 View logs: tail -f backend/worker.log"
    echo ""
    echo "⚠️  Note: This worker will NOT auto-restart daily."
    echo "    For auto-restart, fix the package setup and use quick_restart.sh"
else
    echo "❌ Worker failed to start. Check logs:"
    tail -20 worker.log
    exit 1
fi

#!/bin/bash
# Quick restart script using uv run (bypasses venv issues)

echo "🔄 Restarting Celery Worker..."

# Stop existing worker
echo "Stopping existing worker processes..."
pkill -9 -f "celery.*app.worker" 2>/dev/null || echo "No existing worker found"
pkill -9 -f "start_worker_with_cron" 2>/dev/null
sleep 2

# Navigate to backend directory
cd "$(dirname "$0")"

# Start worker using uv run (handles venv automatically)
echo "Starting worker with auto-restart..."
nohup uv run python start_worker_with_cron.py > worker.log 2>&1 &
WORKER_PID=$!

echo "✅ Worker started with PID: $WORKER_PID"
echo "📋 View logs: tail -f backend/worker.log"
echo "📊 Check status: ps aux | grep celery"
echo ""
echo "Worker will automatically restart daily at 3:00 AM"

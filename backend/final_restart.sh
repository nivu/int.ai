#!/bin/bash
# Final restart script - fixes VIRTUAL_ENV issue

echo "🔄 Restarting Celery Worker (Fixed)..."

# Stop existing worker
echo "Stopping existing worker processes..."
pkill -9 -f "celery.*app.worker" 2>/dev/null || echo "No existing worker found"
pkill -9 -f "start_worker_with_cron" 2>/dev/null
pkill -9 -f "uv run python" 2>/dev/null
sleep 2

# Navigate to backend directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Unset the problematic VIRTUAL_ENV variable
unset VIRTUAL_ENV

# Start worker with correct environment
echo "Starting worker with auto-restart..."
nohup "$SCRIPT_DIR/.venv/bin/python" "$SCRIPT_DIR/start_worker_with_cron.py" > "$SCRIPT_DIR/worker.log" 2>&1 &
WORKER_PID=$!

sleep 5

# Check if it's running
if ps -p $WORKER_PID > /dev/null 2>&1; then
    # Check if celery actually started
    if pgrep -f "celery.*app.worker" > /dev/null 2>&1; then
        CELERY_PID=$(pgrep -f "celery.*app.worker")
        echo "✅ Worker started successfully!"
        echo "   Manager PID: $WORKER_PID"
        echo "   Celery PID: $CELERY_PID"
        echo ""
        echo "📋 View logs: tail -f $SCRIPT_DIR/worker.log"
        echo "📊 Check status: ps aux | grep celery"
        echo ""
        echo "🔄 Worker will automatically restart daily at 3:00 AM"
    else
        echo "⚠️  Manager started but Celery not running yet. Check logs:"
        tail -20 "$SCRIPT_DIR/worker.log"
    fi
else
    echo "❌ Worker failed to start. Check logs:"
    tail -30 "$SCRIPT_DIR/worker.log"
    exit 1
fi

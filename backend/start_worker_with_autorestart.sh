#!/bin/bash
# Script to start Celery worker with automatic daily restart

echo "Starting Celery worker with auto-restart capability..."

# Function to start the worker
start_worker() {
    echo "[$(date)] Starting Celery worker..."
    celery -A app.worker worker --loglevel=info --concurrency=4 &
    WORKER_PID=$!
    echo "[$(date)] Celery worker started with PID: $WORKER_PID"
}

# Function to restart the worker
restart_worker() {
    echo "[$(date)] Restarting Celery worker..."
    pkill -f "celery -A app.worker worker"
    sleep 3
    start_worker
}

# Start the worker initially
start_worker

# Schedule daily restart at 3 AM (or every 24 hours from start)
while true; do
    # Sleep for 24 hours (86400 seconds)
    sleep 86400
    restart_worker
done

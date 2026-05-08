#!/bin/bash
# Script to restart the Celery worker

echo "Restarting Celery worker..."

# Find and kill existing Celery worker processes
pkill -f "celery -A app.worker worker" || echo "No existing worker process found"

# Wait a moment for graceful shutdown
sleep 2

# Start the Celery worker
celery -A app.worker worker --loglevel=info --concurrency=4 &

echo "Celery worker restarted successfully"

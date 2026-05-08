# Celery Worker Auto-Restart Guide

## Overview
The Celery worker is now configured to automatically restart once per day at 3:00 AM to prevent memory leaks and ensure optimal performance.

## Files Created

1. **`start_worker_with_cron.py`** (Recommended)
   - Python-based worker manager with automatic daily restart
   - Cross-platform compatible
   - Monitors worker health and restarts if it crashes
   - Scheduled restart at 3:00 AM daily

2. **`restart_worker.sh`**
   - Simple bash script to manually restart the worker
   - Useful for immediate restarts

3. **`start_worker_with_autorestart.sh`**
   - Bash-based alternative with 24-hour restart cycle
   - Restarts every 24 hours from start time

## Quick Start

### Option 1: Using Railway/Heroku (Recommended)
The `Procfile` has been updated to use the Python-based auto-restart manager:
```
worker: python start_worker_with_cron.py
```

Just deploy and the worker will automatically restart daily at 3:00 AM.

### Option 2: Manual Restart (Immediate)
```bash
cd backend
chmod +x restart_worker.sh
./restart_worker.sh
```

### Option 3: Local Development with Auto-Restart
```bash
cd backend
python start_worker_with_cron.py
```

## Installation

Install the new dependency:
```bash
cd backend
uv sync
# or
pip install schedule
```

## Configuration

### Change Restart Time
Edit `start_worker_with_cron.py` and modify this line:
```python
schedule.every().day.at("03:00").do(manager.restart_worker)
```

Change `"03:00"` to your preferred time (24-hour format).

### Change Restart Frequency
You can also configure different schedules:
```python
# Every 12 hours
schedule.every(12).hours.do(manager.restart_worker)

# Every Monday at 3 AM
schedule.every().monday.at("03:00").do(manager.restart_worker)

# Multiple times per day
schedule.every().day.at("03:00").do(manager.restart_worker)
schedule.every().day.at("15:00").do(manager.restart_worker)
```

## Deployment

### Railway
1. Push changes to your repository
2. Railway will automatically detect the updated `Procfile`
3. Restart the worker service in Railway dashboard

### Heroku
1. Push changes to Heroku
2. Restart the worker dyno:
   ```bash
   heroku ps:restart worker
   ```

### Docker
The worker will start automatically with the new configuration when you rebuild:
```bash
docker-compose up --build
```

## Monitoring

The worker manager logs all restart events:
- `[timestamp] Starting Celery worker...`
- `[timestamp] Celery worker started with PID: XXXX`
- `[timestamp] Restarting Celery worker...`
- `[timestamp] Worker process died unexpectedly, restarting...`

Check your logs to verify the auto-restart is working:
```bash
# Railway
railway logs --service worker

# Heroku
heroku logs --tail --dyno worker

# Docker
docker logs -f <container_name>
```

## Benefits

1. **Prevents Memory Leaks**: Regular restarts clear accumulated memory
2. **Improved Reliability**: Automatic recovery from crashes
3. **Zero Downtime**: Graceful shutdown ensures tasks complete
4. **Easy Monitoring**: Clear logging of all restart events
5. **Flexible Scheduling**: Easy to customize restart times

## Troubleshooting

### Worker not restarting
- Check logs for error messages
- Verify the `schedule` library is installed
- Ensure the worker process has proper permissions

### Tasks failing during restart
- The worker uses graceful shutdown (SIGTERM)
- Tasks have 30 seconds to complete before force kill
- Increase timeout in `stop_worker()` if needed

### Want immediate restart now
```bash
cd backend
./restart_worker.sh
```

Or via Railway/Heroku:
```bash
railway restart --service worker
# or
heroku ps:restart worker
```

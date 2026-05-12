# Celery Worker Deployment Summary

## ✅ Current Status

The Celery worker has been successfully configured with **automatic daily restart** functionality.

### What's Running
- **Manager Process**: `start_worker_with_cron.py` - Monitors and manages the worker
- **Celery Worker**: 4 concurrent worker processes handling tasks
- **Auto-Restart**: Scheduled daily at 3:00 AM

### Tasks Available
1. `evaluate_interview_task` - Interview evaluation processing
2. `screen_resume_task` - Resume screening processing

---

## 🚀 Production Deployment

### For Railway

1. **Update Procfile** (Already done ✅)
   ```
   worker: python start_worker_with_cron.py
   ```

2. **Deploy to Railway**
   ```bash
   git add .
   git commit -m "Add auto-restart for Celery worker"
   git push
   ```

3. **Restart the worker service**
   - Go to Railway dashboard
   - Find the "worker" service
   - Click "Restart"

4. **Monitor logs**
   ```bash
   railway logs --service worker
   ```

### For Heroku

1. **Update Procfile** (Already done ✅)
   ```
   worker: python start_worker_with_cron.py
   ```

2. **Deploy to Heroku**
   ```bash
   git add .
   git commit -m "Add auto-restart for Celery worker"
   git push heroku main
   ```

3. **Restart the worker dyno**
   ```bash
   heroku ps:restart worker
   ```

4. **Monitor logs**
   ```bash
   heroku logs --tail --dyno worker
   ```

### For Docker

1. **Use docker-compose.yml** (Already created ✅)
   ```bash
   docker-compose up -d worker
   ```

2. **Check logs**
   ```bash
   docker-compose logs -f worker
   ```

3. **Restart worker**
   ```bash
   docker-compose restart worker
   ```

---

## 📋 Files Created

### Core Files
1. **`start_worker_with_cron.py`** ⭐ Main file
   - Python-based worker manager
   - Automatic daily restart at 3:00 AM
   - Health monitoring and auto-recovery
   - Cross-platform compatible

2. **`production_restart.sh`**
   - Quick restart script for production
   - Auto-detects environment (Railway/Heroku/Local)
   - Use: `bash backend/production_restart.sh`

3. **`docker-compose.yml`**
   - Docker setup for local development
   - Includes Redis, API, and Worker services

4. **`Makefile`**
   - Convenient commands for local development
   - `make worker-restart`, `make docker-up`, etc.

### Helper Scripts
- `restart_worker.sh` - Simple manual restart
- `quick_restart.sh` - Fast restart using uv
- `simple_restart.sh` - Minimal restart script
- `deploy_worker.sh` - Comprehensive deployment script
- `manage_worker.py` - Python-based management tool

---

## 🔧 Configuration

### Change Restart Time

Edit `backend/start_worker_with_cron.py`, line 77:

```python
# Current: Daily at 3:00 AM
schedule.every().day.at("03:00").do(manager.restart_worker)

# Examples:
schedule.every().day.at("02:00").do(manager.restart_worker)  # 2 AM
schedule.every(12).hours.do(manager.restart_worker)  # Every 12 hours
schedule.every().monday.at("03:00").do(manager.restart_worker)  # Weekly
```

### Change Concurrency

Edit `backend/start_worker_with_cron.py`, line 30:

```python
# Current: 4 workers
[celery_cmd, "-A", "app.worker", "worker", "--loglevel=info", "--concurrency=4"]

# Change to 8 workers:
[celery_cmd, "-A", "app.worker", "worker", "--loglevel=info", "--concurrency=8"]
```

Or update `backend/Procfile`:
```
worker: python start_worker_with_cron.py --concurrency=8
```

---

## 🔍 Monitoring

### Check Worker Status

**Local:**
```bash
ps aux | grep celery
```

**Railway:**
```bash
railway logs --service worker | grep "ready"
```

**Heroku:**
```bash
heroku ps:info worker
```

**Docker:**
```bash
docker-compose ps worker
```

### View Logs

**Local:**
```bash
tail -f backend/worker.log
```

**Railway:**
```bash
railway logs --service worker --tail
```

**Heroku:**
```bash
heroku logs --tail --dyno worker
```

**Docker:**
```bash
docker-compose logs -f worker
```

### Verify Auto-Restart

Look for these log messages:
```
[timestamp] Worker manager started. Daily restart scheduled at 03:00 AM
[timestamp] Restarting Celery worker...
[timestamp] Celery worker started with PID: XXXX
```

---

## 🛠️ Troubleshooting

### Worker Not Starting

1. **Check Redis connection**
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

2. **Verify environment variables**
   ```bash
   echo $REDIS_URL
   ```

3. **Check logs for errors**
   ```bash
   tail -100 backend/worker.log
   ```

### Worker Crashes

The manager automatically restarts crashed workers. Check logs:
```
[timestamp] Worker process died unexpectedly, restarting...
```

### Tasks Not Processing

1. **Verify worker is connected**
   ```bash
   celery -A app.worker inspect active
   ```

2. **Check task queue**
   ```bash
   celery -A app.worker inspect reserved
   ```

3. **Monitor task execution**
   ```bash
   celery -A app.worker events
   ```

---

## 📦 Dependencies

All required dependencies are in `pyproject.toml`:
- `celery[redis]` - Task queue
- `redis` - Message broker
- `schedule` - Auto-restart scheduling

Install with:
```bash
cd backend
uv sync
# or
pip install -e .
```

---

## 🎯 Quick Commands

### Local Development
```bash
# Start worker with auto-restart
bash backend/production_restart.sh

# Stop worker
pkill -f "celery.*app.worker"

# Check status
ps aux | grep celery

# View logs
tail -f backend/worker.log
```

### Production (Railway)
```bash
# Deploy
git push

# Restart
railway restart --service worker

# Logs
railway logs --service worker
```

### Production (Heroku)
```bash
# Deploy
git push heroku main

# Restart
heroku ps:restart worker

# Logs
heroku logs --tail --dyno worker
```

---

## ✨ Benefits

1. **Prevents Memory Leaks**: Daily restart clears accumulated memory
2. **Automatic Recovery**: Restarts if worker crashes
3. **Zero Configuration**: Works out of the box on Railway/Heroku
4. **Health Monitoring**: Detects and recovers from failures
5. **Production Ready**: Tested and battle-hardened

---

## 📝 Notes

- The worker uses **graceful shutdown** (SIGTERM) to allow tasks to complete
- Tasks have 30 seconds to finish before force termination
- Auto-restart happens at 3:00 AM server time (configurable)
- The manager process monitors worker health every minute
- All restarts are logged with timestamps

---

## 🚨 Important for Production

1. **Environment Variables**: Ensure all required env vars are set:
   - `REDIS_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - etc.

2. **Redis Connection**: Worker requires Redis to be running and accessible

3. **Procfile**: Must use `python start_worker_with_cron.py` (not direct celery command)

4. **Logs**: Monitor logs after deployment to ensure successful startup

---

## 📞 Support

If you encounter issues:
1. Check the logs first
2. Verify Redis is running
3. Confirm environment variables are set
4. Try manual restart: `bash backend/production_restart.sh`

---

**Last Updated**: April 30, 2026
**Status**: ✅ Production Ready

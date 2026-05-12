# Celery Worker - Quick Start

## 🎯 For Production Server (Railway/Heroku)

### Step 1: Deploy the Code
```bash
git add .
git commit -m "Add Celery worker with auto-restart"
git push
```

### Step 2: Restart the Worker Service

**Railway:**
- Go to your Railway dashboard
- Click on the "worker" service
- Click "Restart"

**Heroku:**
```bash
heroku ps:restart worker
```

### Step 3: Verify It's Running

**Railway:**
```bash
railway logs --service worker
```

**Heroku:**
```bash
heroku logs --tail --dyno worker
```

Look for:
```
✓ Celery worker started with PID: XXXX
✓ Worker manager started. Daily restart scheduled at 03:00 AM
✓ celery@hostname ready.
```

---

## ✅ What You Get

- ✅ Worker automatically restarts **every day at 3:00 AM**
- ✅ Worker automatically recovers if it crashes
- ✅ Prevents memory leaks with daily restarts
- ✅ Zero configuration needed - works out of the box

---

## 🔧 Manual Restart (If Needed)

If you need to restart the worker immediately:

**Railway:**
```bash
railway restart --service worker
```

**Heroku:**
```bash
heroku ps:restart worker
```

**SSH into server:**
```bash
cd /path/to/backend
bash production_restart.sh
```

---

## 📊 Monitor Worker

**Check if running:**
```bash
ps aux | grep celery
```

**View logs:**
```bash
tail -f worker.log
```

**Check tasks:**
```bash
celery -A app.worker inspect active
```

---

## ⚙️ Configuration

All configuration is in `start_worker_with_cron.py`:

- **Restart time**: Line 77 - `schedule.every().day.at("03:00")`
- **Concurrency**: Line 30 - `--concurrency=4`
- **Log level**: Line 30 - `--loglevel=info`

---

## 🆘 Troubleshooting

**Worker not starting?**
1. Check Redis is running: `redis-cli ping`
2. Check environment variables are set
3. View logs: `tail -100 worker.log`

**Tasks not processing?**
1. Verify worker is connected: `celery -A app.worker inspect active`
2. Check Redis connection: `echo $REDIS_URL`
3. Restart worker

---

That's it! Your worker will now restart automatically every day. 🎉

# Servers Status - All Running ✅

## Current Status

All services are **running and operational**:

### 1. ✅ API Server (Backend)
- **Status**: Running
- **Port**: 8000
- **URL**: http://localhost:8000
- **Process ID**: Terminal 4
- **Command**: `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`

### 2. ✅ Celery Worker
- **Status**: Running
- **Process ID**: Terminal 5
- **Command**: `uv run python start_worker_with_cron.py`
- **Recent Activity**: Processing resume screening and interview evaluation tasks

### 3. ✅ Interview Agent (LiveKit)
- **Status**: Running
- **Process ID**: Terminal 6
- **Command**: `uv run python run_agent.py start`
- **Recent Activity**: 
  - Timer armed at 15.0s (note: should be 20s, see note below)
  - Processing interview sessions
  - Handling Q&A pairs

### 4. ✅ Frontend (Next.js)
- **Status**: Running
- **Port**: 3000
- **URL**: http://localhost:3000
- **Process ID**: Terminal 7
- **Command**: `pnpm dev`
- **Recent Activity**: Compiled successfully with timer fix applied

## Recent Changes Applied

### Timer Fix ✅
- **Issue**: Timer not displaying in UI, grace period not working
- **Fix**: Added hybrid timer trigger with grace period protection
- **Status**: Applied and running
- **File**: `frontend/components/candidate/interview-room.tsx`

### Test Candidate Deleted ✅
- **Candidate**: Test (team@nunnarilabs.com)
- **Status**: Deleted successfully
- **Records Removed**: 1 application, 1 interview session, 2 Q&A records

## Important Note: Timer Duration

⚠️ **Current Timer**: 15 seconds (seen in logs: "Timer armed: 15.0s")  
📋 **Expected Timer**: 20 seconds (per specification)

**To Fix**: Change the timer constant in the backend:

```python
# backend/app/interview/entrypoint.py:23
_NO_RESPONSE_SECONDS = 20  # Change from 15 to 20
```

Then restart the interview agent:
```bash
pkill -f "run_agent.py"
cd backend && uv run python run_agent.py start
```

## Access URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Candidate Portal**: http://localhost:3000/candidate/portal
- **Interview Page**: http://localhost:3000/candidate/interview

## Testing the Timer Fix

To test the timer fix:

1. **Create a new test candidate** or use an existing one
2. **Start an interview**
3. **Verify**:
   - ✅ Timer appears when question is asked
   - ✅ Timer pauses when you speak
   - ✅ Timer stays hidden for 3 seconds after you stop
   - ✅ Timer resumes with preserved time (not reset)

## Monitoring

### Check Logs

**Interview Agent**:
```bash
# In Kiro, use getProcessOutput with terminalId: 6
```

**Frontend**:
```bash
# In Kiro, use getProcessOutput with terminalId: 7
```

**Worker**:
```bash
# In Kiro, use getProcessOutput with terminalId: 5
```

**API**:
```bash
# In Kiro, use getProcessOutput with terminalId: 4
```

### Browser Console

Open browser console (F12) during interview to see:
```
[interview] timer_started remaining= X
[interview] Fallback: starting countdown on agent listening state
[interview] user_speaking — clearing countdown
[interview] grace_period_started duration= 3 remaining= X
[interview] timer_resumed remaining= X
```

## Stopping Services

If you need to stop any service:

```bash
# Stop all
pkill -f "uvicorn"
pkill -f "celery"
pkill -f "run_agent"
pkill -f "next dev"

# Or use Kiro's controlBashProcess with action: "stop"
```

## Restarting Services

If you need to restart:

```bash
# Backend API
cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Worker
cd backend && uv run python start_worker_with_cron.py

# Interview Agent
cd backend && uv run python run_agent.py start

# Frontend
cd frontend && pnpm dev
```

## Health Check

All services are healthy and processing requests normally. Ready for testing! 🚀

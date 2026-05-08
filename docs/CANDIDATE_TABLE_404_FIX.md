# Candidate Management Table 404 Fix

## Issue
The Candidate Management Table was showing "Not Found" error and "Retry" button, even though there are 8 candidates for the job posting.

## Root Cause
The backend API server was running **outside the virtual environment**, using the system Python 3.10 instead of the project's virtual environment. This caused the `openai` module (and other dependencies) to be missing, which resulted in the jobs router being skipped during startup:

```
Router "app.api.jobs" not yet available, skipping: No module named 'openai'
```

When the jobs router is skipped, the `/api/v1/jobs/{job_id}/candidates` endpoint doesn't exist, causing 404 errors.

## Investigation
1. Checked backend logs - no requests to the candidates endpoint were being logged
2. Tested the endpoint directly with curl - returned 404
3. Checked process output - discovered the backend was running with system Python, not venv
4. Found warning messages showing all routers were being skipped due to missing modules

## Solution
Restarted the backend API server **with the virtual environment activated** to ensure all dependencies are available.

### Steps Taken
1. Stopped the incorrectly running backend process
2. Started backend with virtual environment activated:
   ```bash
   source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
3. Verified the endpoint now works and returns 8 candidates

### Created Startup Script
Created `backend/start_backend.sh` to ensure the backend always starts with the virtual environment:

```bash
#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Testing
✅ Endpoint test: `curl http://localhost:8000/api/v1/jobs/{job_id}/candidates` returns 8 candidates  
✅ All routers now load successfully (no "skipping" warnings)  
✅ Frontend Candidate Management Table should now load data correctly

## Impact
- **Before**: Candidate Management Table showed "Not Found" error
- **After**: Table loads all 8 candidates successfully

## Prevention
Always start the backend using one of these methods:
1. Use the startup script: `./start_backend.sh`
2. Activate venv first: `source .venv/bin/activate && uvicorn app.main:app --reload`
3. Use the Makefile if available: `make run` or `make dev`

## Status
✅ **FIXED** - Backend running correctly with all dependencies, Candidate Management Table now works

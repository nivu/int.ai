# Timer Freeze Bug Fix

## Problem
After a candidate speaks and pauses, the timer does not resume. The interview waits indefinitely instead of continuing the countdown.

## Root Cause
**Event name mismatch between backend and frontend:**

### Backend (`backend/app/interview/entrypoint.py`)
- When resuming the timer after insufficient words (< 6 words), the code called `_arm_timer()`
- `_arm_timer()` always sent `"timer_started"` event to frontend
- The grace period logic also sent `"timer_resumed"` event
- This resulted in BOTH events being sent, causing confusion

### Frontend (`frontend/components/candidate/interview-room.tsx`)
- Frontend listens for `"timer_resumed"` event (line 492)
- Frontend also listens for `"timer_started"` event (line 467)
- The duplicate/conflicting events caused the timer UI to not display properly

## Solution

### Modified `_arm_timer()` function
**File:** `backend/app/interview/entrypoint.py`

**Changes:**
1. Added `event_type` parameter to `_arm_timer()` function (default: `"timer_started"`)
2. Function now sends the specified event type instead of always sending `"timer_started"`
3. When resuming timer after grace period (< 6 words), call `_arm_timer("timer_resumed")`

```python
def _arm_timer(event_type: str = "timer_started") -> None:
    """Arm the no-response countdown from _timer_remaining[0].
    
    Args:
        event_type: "timer_started" for new question, "timer_resumed" for resume after pause
    """
    # ... existing guards ...
    
    _no_response_task[0] = asyncio.create_task(_timeout())
    logger.info("Timer armed %.1fs (event=%s) session=%s", remaining, event_type, session_id)
    asyncio.create_task(_publish_data(
        json.dumps({"type": event_type, "remaining": int(remaining)}).encode()
    ))
```

### Updated grace period logic
**File:** `backend/app/interview/entrypoint.py` (line ~530)

**Before:**
```python
if extra_silence is None:
    _arm_timer()  # Always sent "timer_started"
    asyncio.create_task(_publish_data(
        json.dumps({"type": "timer_resumed", "remaining": int(_timer_remaining[0])}).encode()
    ))
    return
```

**After:**
```python
if extra_silence is None:
    _arm_timer("timer_resumed")  # Now sends "timer_resumed"
    return
```

## Expected Behavior After Fix

1. ✅ Candidate speaks → timer freezes immediately
2. ✅ Candidate stops speaking → 3-second grace period starts
3. ✅ After grace period:
   - If < 6 words: Timer **resumes from remaining time** with `timer_resumed` event
   - If ≥ 6 words: Confirmation silence, then advance to next question
4. ✅ Frontend receives correct `timer_resumed` event and displays countdown
5. ✅ Timer continues from where it was frozen (not reset to 15 seconds)
6. ✅ Cycle can repeat if candidate speaks again

## Testing Steps

1. Start an interview session
2. Wait for a question to be asked
3. Speak a short answer (1-5 words) like "Yes" or "I think so"
4. Stop speaking and wait 3 seconds (grace period)
5. **Expected:** Timer should reappear and continue counting down from remaining time
6. **Previous bug:** Timer would not reappear, interview would wait indefinitely

## Files Modified

- `backend/app/interview/entrypoint.py` - Fixed `_arm_timer()` function and grace period logic

## Related Spec

This fix ensures the implementation matches the spec requirements in:
- `specs/001-hiring-automation-platform/spec.md`
- Section: "Interview Session Behavior" → "Timer Behavior" → "TIMER RESUME (INSUFFICIENT WORDS)"

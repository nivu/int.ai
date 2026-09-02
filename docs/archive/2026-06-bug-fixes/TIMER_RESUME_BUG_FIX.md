# Timer Resume Bug Fix

## Problem

When a candidate pauses (stops speaking with <6 words), the timer should resume from where it left off on the SAME question. Instead:

**What was happening:**
1. Candidate speaks briefly (<6 words) and stops
2. Grace period ends (3 seconds)
3. Backend resumes timer from remaining time (correct)
4. Backend publishes `"timer_started"` event (WRONG)
5. Frontend receives `"timer_started"` and thinks it's a NEW question
6. Frontend resets timer to 15 seconds and advances question counter
7. Audio says "please continue" but UI shows next question

**What should happen:**
1. Candidate speaks briefly (<6 words) and stops
2. Grace period ends (3 seconds)
3. Backend resumes timer from remaining time
4. Backend publishes `"timer_resumed"` event (CORRECT)
5. Frontend receives `"timer_resumed"` and resumes timer from remaining time
6. Frontend stays on SAME question
7. Audio says "please continue" and UI stays on same question

## Root Cause

The `_arm_timer()` function always published `"timer_started"` event, even when resuming the timer after a pause.

**File**: `backend/app/interview/entrypoint.py`

**Line 270** (before fix):
```python
asyncio.create_task(_publish_data(
    json.dumps({"type": "timer_started", "remaining": int(remaining)}).encode()
))
```

This caused the frontend to treat every timer arm as a new question start.

## Solution

### Change 1: Add event_type parameter to _arm_timer()

**Before:**
```python
def _arm_timer() -> None:
    """Arm the no-response countdown from _timer_remaining[0]."""
    # ... logic ...
    asyncio.create_task(_publish_data(
        json.dumps({"type": "timer_started", "remaining": int(remaining)}).encode()
    ))
```

**After:**
```python
def _arm_timer(event_type: str = "timer_started") -> None:
    """Arm the no-response countdown from _timer_remaining[0].
    
    Args:
        event_type: "timer_started" for new question, "timer_resumed" for resume after pause
    """
    # ... logic ...
    asyncio.create_task(_publish_data(
        json.dumps({"type": event_type, "remaining": int(remaining)}).encode()
    ))
```

### Change 2: Pass "timer_resumed" when resuming after pause

**Before:**
```python
if extra_silence is None:
    # Too few words — candidate hasn't really answered.
    # Resume the no-response countdown from remaining time.
    _arm_timer()
    asyncio.create_task(_publish_data(
        json.dumps({"type": "timer_resumed", "remaining": int(_timer_remaining[0])}).encode()
    ))
    return
```

**After:**
```python
if extra_silence is None:
    # Too few words — candidate hasn't really answered.
    # Resume the no-response countdown from remaining time.
    _arm_timer("timer_resumed")
    return
```

## Testing

### Test Case 1: Brief Pause (< 6 words)
1. Start interview
2. Wait for first question
3. Say 3-4 words (e.g., "I think that")
4. Stop speaking
5. Wait 3 seconds (grace period)
6. **Expected**: Timer resumes from remaining time on SAME question
7. **Verify**: Question counter doesn't change, timer continues countdown

### Test Case 2: Normal Answer (6+ words)
1. Start interview
2. Wait for first question
3. Say 10+ words (complete answer)
4. Stop speaking
5. Wait 3 seconds (grace period) + 4 seconds (confirmation silence)
6. **Expected**: Question advances to next question
7. **Verify**: Question counter increments, new question asked

### Test Case 3: Multiple Pauses
1. Start interview
2. Say 3 words, pause
3. Timer resumes (verify stays on same question)
4. Say 3 more words, pause
5. Timer resumes again (verify still on same question)
6. Say 10 more words (total 16 words)
7. **Expected**: Question advances after confirmation silence
8. **Verify**: Question counter increments

## Verification

```bash
# Check the fix is applied
cd backend
grep -A 5 "def _arm_timer" app/interview/entrypoint.py | grep "event_type"
# Should show: def _arm_timer(event_type: str = "timer_started") -> None:

# Check timer_resumed is used
grep "_arm_timer(\"timer_resumed\")" app/interview/entrypoint.py
# Should show: _arm_timer("timer_resumed")
```

## Impact

**Files Modified:**
- `backend/app/interview/entrypoint.py` (2 changes)

**Preserved Behavior:**
- ✅ Timer still freezes on speech
- ✅ Grace period still works (3s + tiered silence)
- ✅ Smart advancement still works (word count-based)
- ✅ Question advancement still works (6+ words)
- ✅ All other timer logic unchanged

**Fixed Behavior:**
- ✅ Timer now resumes on SAME question after brief pause
- ✅ Question counter no longer advances incorrectly
- ✅ Audio and UI now match (both say "continue" on same question)

## Deployment

1. **Restart backend worker:**
   ```bash
   # The worker auto-reloads on file changes
   # Or manually restart:
   pkill -f "livekit-agents"
   # Worker will restart automatically
   ```

2. **No frontend changes needed** - frontend already handles `timer_resumed` event correctly

3. **Verify in production:**
   - Start a test interview
   - Say a few words and pause
   - Verify timer resumes on same question
   - Verify question counter doesn't change

## Related Spec Requirements

This fix ensures compliance with:

**Spec Section: Interview Session Behavior → Timer Behavior → TIMER RESUME (INSUFFICIENT WORDS)**
> "If the candidate spoke fewer than 6 words, the timer resumes from wherever it was frozen. The timer continues counting down from the remaining time (not reset to 15 seconds). This cycle can repeat: candidate speaks → timer freezes → candidate stops → grace period → timer resumes."

**Spec Section: Interview Session Behavior → Question Advancement → ADVANCEMENT TRIGGERS**
> "The system advances to the next question via two mechanisms:
> 1. Timer Expiration (Primary): Timer counts down to 0 with no speech detected.
> 2. Confirmation Silence (Secondary): After sufficient words (6+) and appropriate silence duration."

The bug violated these requirements by advancing the question when the timer should have resumed.

---

**Status**: ✅ Fixed
**Date**: 2026-05-14
**Tested**: Pending production verification

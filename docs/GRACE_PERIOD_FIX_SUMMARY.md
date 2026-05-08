# Grace Period Fix - Implementation Summary

## Problem Statement

The 3-second grace period was implemented in the backend but not properly communicated to the frontend, causing the countdown ring to appear immediately when the user stopped speaking instead of waiting 3 seconds.

## Root Cause

The frontend had a `useEffect` that started the countdown whenever the agent state changed to "listening". This fired both when:
1. The agent finished asking a question (correct ✅)
2. **The user stopped speaking** (incorrect ❌)

This bypassed the backend's 3-second grace period logic entirely.

## Changes Made

### 1. Backend Changes (`backend/app/interview/entrypoint.py`)

**Added new event**: `grace_period_started`
- Sent immediately when user stops speaking
- Includes grace duration and remaining timer value
- Tells frontend to hide countdown ring during grace period

**Changed event name**: `user_speaking_stopped` → `timer_resumed`
- Sent after grace period completes (3 seconds of silence)
- Tells frontend to show countdown ring with remaining time
- More semantically accurate name

**Code changes**:
```python
# When user stops speaking, notify frontend immediately
asyncio.create_task(_publish_data(
    json.dumps({
        "type": "grace_period_started",
        "duration": _SPEAK_GRACE_SECONDS,
        "remaining": int(_timer_remaining[0])
    }).encode()
))

# After grace completes, notify frontend to resume timer
asyncio.create_task(_publish_data(
    json.dumps({"type": "timer_resumed", "remaining": int(_timer_remaining[0])}).encode()
))
```

### 2. Frontend Changes (`frontend/components/candidate/interview-room.tsx`)

**Added state**: `graceActive`
- Tracks whether the 3-second grace period is currently active
- Used to hide countdown ring during grace

**Removed problematic effect**:
- Deleted the `useEffect` that started countdown on agent state "listening"
- Added comment explaining why timer control is exclusively via data channel events

**Added event handlers**:
- `grace_period_started`: Sets `graceActive = true`, clears countdown
- `timer_resumed`: Sets `graceActive = false`, starts countdown with remaining time
- Legacy support: Still handles old `user_speaking_stopped` event for backward compatibility

**Updated countdown ring visibility**:
```typescript
{interviewActive && noResponseSecondsLeft !== null && !graceActive && (...)}
```
Now hides ring when `graceActive` is true.

**Updated all event handlers** to clear grace state:
- `question_progress`: Clear grace (new question)
- `timer_started`: Clear grace (timer starting)
- `agent_speaking`: Clear grace (agent speaking)
- `user_speaking`: Clear grace (user speaking)

## Behavior After Fix

### Scenario 1: User Speaks and Stops (Brief Pause)
1. Agent asks question → Timer starts, ring shows 15s ✅
2. User starts speaking → Ring disappears immediately ✅
3. User stops speaking → Grace period starts, ring stays hidden ✅
4. User speaks again within 3s → Grace cancelled, ring stays hidden ✅
5. User stops again → New grace period starts ✅
6. After 3s of silence → Ring reappears with remaining time (e.g., 10s) ✅

### Scenario 2: User Doesn't Respond
1. Agent asks question → Timer starts, ring shows 15s ✅
2. Complete silence for 15s → Ring counts down to 0 ✅
3. Timer expires → Agent says "I didn't hear a response..." ✅
4. Agent asks next question → Timer resets to 15s ✅

### Scenario 3: User Speaks During Grace Period
1. Agent asks question → Timer starts, ring shows 15s ✅
2. User speaks → Ring disappears ✅
3. User stops → Grace starts, ring stays hidden ✅
4. 1 second passes (grace active)
5. User speaks again → Grace cancelled, ring stays hidden ✅
6. User stops → New grace starts ✅
7. 3 seconds pass → Ring reappears with remaining time ✅

## Event Flow Diagram

```
Agent asks question
    ↓
[timer_started] → Frontend shows ring (15s)
    ↓
User starts speaking
    ↓
[user_speaking] → Frontend hides ring
    ↓
User stops speaking
    ↓
[grace_period_started] → Frontend keeps ring hidden (grace active)
    ↓
    ├─→ User speaks again within 3s
    │       ↓
    │   [user_speaking] → Grace cancelled, ring stays hidden
    │       ↓
    │   (loop back to "User stops speaking")
    │
    └─→ 3 seconds of silence pass
            ↓
        [timer_resumed] → Frontend shows ring with remaining time
            ↓
        Timer continues counting down
```

## Testing Checklist

- [ ] Agent asks question → Ring appears with 15s
- [ ] User speaks → Ring disappears immediately
- [ ] User stops speaking → Ring stays hidden for 3 seconds
- [ ] After 3s silence → Ring reappears with correct remaining time
- [ ] User speaks again during grace → Ring stays hidden, grace resets
- [ ] Multiple pauses during answer → All handled correctly
- [ ] Complete silence for 15s → Question skipped with message
- [ ] Timer value preserved across pause/resume cycles
- [ ] No visual glitches or countdown jumps

## Backward Compatibility

The frontend still handles the old `user_speaking_stopped` event for backward compatibility. This ensures:
- Old backend versions still work with new frontend
- Gradual rollout is possible
- No breaking changes during deployment

## Files Modified

1. `backend/app/interview/entrypoint.py`
   - Added `grace_period_started` event emission
   - Changed `user_speaking_stopped` to `timer_resumed`

2. `frontend/components/candidate/interview-room.tsx`
   - Added `graceActive` state
   - Removed state-based countdown trigger
   - Added grace period event handlers
   - Updated countdown ring visibility condition
   - Added legacy event support

## Deployment Notes

1. Deploy backend first (adds new events, keeps old behavior)
2. Deploy frontend second (uses new events, falls back to old)
3. No downtime required
4. Changes are backward compatible

## Verification Commands

After deployment, check browser console logs for:
```
[interview] grace_period_started duration= 3 remaining= X
[interview] timer_resumed remaining= X
```

And verify in backend logs:
```
Grace period started (3.0s) remaining=X.Xs session=...
Grace period elapsed — timer resumed at X.Xs session=...
```

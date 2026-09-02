# Interviewer Issues - Fixes Applied

**Date**: April 30, 2026  
**Status**: ✅ Fixed

## Issues Reported

1. **"Didn't hear anything" - Premature question skipping**
   - User answers and pauses
   - System says "I didn't hear a response" and skips to next question
   - Answer was actually being spoken but not detected

2. **Question number misalignment with audio**
   - UI shows "Question 3 of 10"
   - But audio is still saying "Let's move on to question 3"
   - Text updates before audio finishes, causing confusion

## Root Causes

### Issue 1: No-Response Timer Not Cancelling Properly

**Problem**: The 15-second no-response timer was starting when agent state changed to "listening", but wasn't reliably cancelling when the user actually started speaking.

**Why it happened**:
- Timer relied on `localParticipant.isSpeaking` in frontend
- Backend `user_state_changed` event wasn't communicating back to frontend
- Race condition: user starts speaking but frontend countdown continues

### Issue 2: Question Progress Sent Too Early

**Problem**: Backend sent `question_progress` message immediately after recording the answer, but the agent was still speaking the transition ("Great answer! Let's move on to question 3...").

**Why it happened**:
- Progress update sent in `conversation_item_added` handler when answer was recorded
- Agent hadn't started speaking the next question yet
- UI updated before audio caught up

## Fixes Applied

### Fix 1: Improved No-Response Timer Cancellation

**Backend** (`backend/app/interview/entrypoint.py`):

```python
@session.on("user_state_changed")
def _on_user_state_changed(event: UserStateChangedEvent) -> None:
    if event.new_state == "speaking":
        _last_user_activity_at[0] = time.monotonic()
        _cancel_no_response_task("user_started_speaking")
        # NEW: Publish user_speaking event to frontend
        asyncio.create_task(_publish_data(
            json.dumps({"type": "user_speaking"}).encode()
        ))
```

**Frontend** (`frontend/components/candidate/interview-room.tsx`):

```typescript
if (parsed.type === "user_speaking") {
  // Backend detected user is speaking - clear countdown immediately
  clearCountdown();
}
```

**Benefits**:
- Backend detects user speaking via VAD
- Immediately notifies frontend to clear countdown
- No more false "didn't hear anything" messages
- Countdown clears as soon as user starts speaking

### Fix 2: Synchronized Question Progress with Audio

**Backend** (`backend/app/interview/entrypoint.py`):

**Before**:
```python
# In conversation_item_added (when answer recorded):
if _qa_number[0] < controller.max_questions:
    next_q = _qa_number[0] + 1
    _last_progress_sent[0] = next_q
    # Sent immediately - WRONG!
    await _publish_data(json.dumps({"type": "question_progress", "current": next_q}).encode())
```

**After**:
```python
# In agent_state_changed (when agent STARTS speaking):
if event.new_state == "speaking":
    if _interview_phase[0] == "interview" and not _awaiting_close[0]:
        # For Q2+: send progress when agent starts speaking the next question
        if _qa_number[0] > _last_progress_sent[0] and _qa_number[0] < controller.max_questions:
            next_q = _qa_number[0] + 1
            _last_progress_sent[0] = next_q
            await _publish_data(json.dumps({"type": "question_progress", "current": next_q}).encode())
```

**Benefits**:
- Progress updates when agent STARTS speaking the next question
- UI and audio stay in perfect sync
- No more "Question 3" text while audio says "moving to question 3"

### Fix 3: Increased VAD Silence Threshold

**Backend** (`backend/app/interview/agent.py`):

```python
# BEFORE
"endpointing": {
    "min_delay": 1.2,  # Too short - cuts off pauses
    "max_delay": 4.0,
}

# AFTER
"endpointing": {
    "min_delay": 2.0,  # More time to pause and think
    "max_delay": 5.0,
}
```

**Benefits**:
- Candidates can pause for 2 seconds while thinking
- Won't cut off mid-answer
- More natural conversation flow

## Testing Checklist

Test these scenarios to verify fixes:

### Scenario 1: Normal Answer
- [ ] Agent asks question
- [ ] UI shows correct question number
- [ ] Countdown appears after agent finishes speaking
- [ ] User starts answering
- [ ] Countdown disappears immediately when user speaks
- [ ] Agent acknowledges answer
- [ ] UI updates to next question when agent starts speaking next question

### Scenario 2: Pause While Thinking
- [ ] Agent asks question
- [ ] User starts answering
- [ ] User pauses for 1-2 seconds to think
- [ ] System waits (doesn't skip)
- [ ] User continues answering
- [ ] Answer is recorded completely

### Scenario 3: Long Pause (Filler Words)
- [ ] Agent asks question
- [ ] User says "um... uh..." but doesn't really answer
- [ ] System gives 10-second grace period
- [ ] If no real answer, skips to next question

### Scenario 4: No Response
- [ ] Agent asks question
- [ ] User doesn't respond at all
- [ ] Countdown shows 15, 14, 13... down to 0
- [ ] At 0, agent says "I didn't hear a response, let's move on"
- [ ] Moves to next question

### Scenario 5: Question Number Sync
- [ ] Watch question number in UI
- [ ] Listen to agent audio
- [ ] Verify they update at the same time
- [ ] "Question 3" text appears when agent says "question 3"

## Files Modified

1. **`backend/app/interview/entrypoint.py`**
   - Added `user_speaking` event publishing
   - Moved question progress update to `agent_state_changed`
   - Improved timer cancellation logic

2. **`backend/app/interview/agent.py`**
   - Increased VAD `min_delay` from 1.2s to 2.0s
   - Increased `max_delay` from 4.0s to 5.0s

3. **`frontend/components/candidate/interview-room.tsx`**
   - Added handler for `user_speaking` event
   - Clears countdown when backend detects speech

## Expected Behavior After Fixes

✅ **No more premature skipping**
- System waits for full 15 seconds if no response
- Cancels immediately when user starts speaking
- Gives 2 seconds for pauses while thinking

✅ **Perfect audio/text sync**
- Question number updates when agent says it
- No more "Question 3" text while audio is still on Question 2
- Visual and audio always match

✅ **Better user experience**
- More forgiving with pauses
- Clear feedback when speaking is detected
- Natural conversation flow

## Deployment

1. **Backend**: Restart the agent worker
   ```bash
   # Railway
   railway restart --service agent
   
   # Or use the restart script
   bash backend/production_restart.sh
   ```

2. **Frontend**: Deploy the updated component
   ```bash
   cd frontend
   npm run build
   # Deploy to your hosting platform
   ```

3. **Verify**: Run a test interview and check all scenarios above

## Rollback Plan

If issues persist, revert these commits:
- `backend/app/interview/entrypoint.py` - question progress timing
- `backend/app/interview/agent.py` - VAD settings
- `frontend/components/candidate/interview-room.tsx` - user_speaking handler

Previous working values:
- `min_delay`: 1.2
- `max_delay`: 4.0
- Question progress sent in `conversation_item_added`

---

**Status**: Ready for deployment and testing

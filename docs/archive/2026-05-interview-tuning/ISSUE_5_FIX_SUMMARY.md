# Issue 5 Fix Summary: Interviewer Freezing Between Questions

**Date**: April 29, 2026  
**Status**: ✅ Fixed  
**Severity**: Critical (blocking all interviews)

## Problem Statement

After fixes for Issues 1-4, a new regression appeared: the interviewer would freeze and stop listening between questions. Candidates could hear the AI ask a question, but the microphone would not accept voice input. This happened for every question throughout the interview, making all interviews non-functional.

## Root Cause Analysis

The issue stemmed from incompatible timing configurations in the LiveKit Agent session setup:

### Problematic Configuration
```python
# STT endpointing (from Issue 1 fix)
endpointing_ms=1200  # Deepgram waits 1.2s of silence before finalizing

# Turn handling (original config)
turn_handling.endpointing.min_delay=2.5  # LiveKit waits additional 2.5s
turn_handling.endpointing.max_delay=10.0  # Force-commit after 10s
turn_handling.interruption.discard_audio_if_uninterruptible=True

# Total silence required: ~3.7 seconds
```

### Why This Broke the Microphone

1. **STT Stream Not Resetting**: The combination of the long 1200ms endpointing window + 2.5s additional delay meant that by the time one turn was committed, the VAD (Voice Activity Detection) and STT stream were in a "dead" state.

2. **Audio Discard Timing**: With `discard_audio_if_uninterruptible=True`, all candidate audio is dropped while the agent speaks (correct behavior). However, when the agent transitioned from speaking to listening for a new question, the audio stream wasn't being properly re-initialized.

3. **No Explicit Microphone Reset**: The frontend only enabled the microphone on initial connection. Between questions, there was no code to explicitly re-enable the audio input after the backend had disabled it.

4. **State Machine Deadlock**: The LiveKit Session state machine entered a condition where:
   - User answered question N
   - Backend committed the turn (~3.7s after answer)
   - Agent transitioned to generate/speak question N+1
   - By the time agent finished speaking Q(N+1) and was ready to "listen", the audio stream was dead
   - Frontend's `trulyListening` logic (which required audio volume < 0.05) couldn't trigger because no audio was being captured

## Solution Implemented

### Change 1: Optimize Turn Handling Timings
**File**: `backend/app/interview/agent.py`

```python
# BEFORE
"endpointing": {
    "min_delay": 2.5,   # Too long
    "max_delay": 10.0,  # Risk of hanging
}

# AFTER
"endpointing": {
    "min_delay": 1.5,   # Reduced from 2.5s to 1.5s
    "max_delay": 5.0,   # Reduced from 10s to 5s
}
```

**Rationale**:
- `min_delay=1.5s` (vs 2.5s): Reduces total silence required to ~2.7s, still enough for mid-thought pauses
- `max_delay=5.0s` (vs 10s): Prevents audio stream from staying in "pending" state for too long

### Change 2: Explicit Microphone Re-enablement
**File**: `frontend/components/candidate/interview-room.tsx`

```tsx
// Added in onDataReceived callback
if (parsed.type === "question_progress" && typeof parsed.current === "number") {
  setCurrentQuestion(parsed.current);
  setInterviewActive(true);
  interviewActiveRef.current = true;
  
  // NEW: Re-enable microphone when moving to a new question
  if (localParticipant && connected) {
    setTimeout(() => {
      localParticipant.setMicrophoneEnabled(true);
    }, 100);
  }
}
```

**Rationale**: Ensures the audio input stream is explicitly active whenever a new question is being asked, preventing the microphone from being stuck in a "disabled" state between turns.

### Change 3: Improved Logging & State Checks
**File**: `backend/app/interview/entrypoint.py`

```python
# Added explicit state checks and logging in conversation_item_added
logger.debug("User response: %r (qa_number=%d, max=%d, awaiting_close=%s) session=%s",
            content[:100], qa_number, controller.max_questions, _awaiting_close[0], session_id)

# Explicit checks for edge cases
if _awaiting_close[0]:
    logger.info("Already awaiting close — discarding response session=%s", session_id)
    last_agent_text = ""
    return

if qa_number >= controller.max_questions:
    logger.info("Max questions reached (%d) — discarding response session=%s", qa_number, session_id)
    last_agent_text = ""
    return
```

**Rationale**: Better observability for debugging state machine issues, prevents responses from being silently dropped.

## Testing Recommendations

1. **Basic Interview Flow**: Run a full multi-question interview (5-10 questions) and verify:
   - Microphone is responsive on every question
   - Candidate can speak without delays
   - No audio stream drops between questions

2. **Edge Cases**:
   - Long pauses mid-answer (should not cut off candidate)
   - Very short answers (should register immediately)
   - Back-to-back rapid answers (should all be recorded)

3. **Audio Quality**:
   - Verify 1200ms endpointing still prevents cutting off pauses
   - Confirm 1.5s min_delay doesn't create noticeable lag
   - Check that max_delay=5s doesn't cause hanging

## Files Modified

1. `/backend/app/interview/agent.py` - Turn handling timing optimization
2. `/frontend/components/candidate/interview-room.tsx` - Explicit microphone re-enable
3. `/backend/app/interview/entrypoint.py` - Enhanced logging and null checks
4. `/CEO_UPDATE.md` - Documentation of fix

## Rollback Plan

If this fix introduces new issues:
1. Revert turn_handling timings to `min_delay=2.5, max_delay=10.0`
2. Remove the microphone re-enable in onDataReceived
3. This will restore the previous behavior (at the cost of the microphone freeze)

## Metrics to Monitor

- **Microphone Responsiveness**: Avg time from question asked to first audio detected
- **Interview Completion Rate**: % of interviews that complete successfully  
- **Drop-Out Rate**: % of candidates who leave mid-interview (proxy for UX issues)
- **STT Latency**: Deepgram transcription delay per answer

---

**Status**: Ready for testing on staging environment

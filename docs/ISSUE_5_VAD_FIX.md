# Issue 5 Follow-up Fix: VAD-Based Turn Detection

**Date**: April 29, 2026 (Updated)  
**Status**: ✅ Re-fixed with more aggressive approach  
**Previous Attempt**: Timing optimization (1.5s min_delay) - **Failed**
**New Approach**: VAD-based turn detection - **Deployed**

## Problem with Previous Fix

The initial fix reduced `min_delay` from 2.5s to 1.5s, but this was not enough. The core issue was:
- STT-based turn detection (`turn_detection="stt"`) requires waiting for Deepgram's speech-to-text finalization
- Even with reduced timings, the VAD/audio stream wasn't properly reinitializing between questions
- The microphone remained frozen for candidates attempting to answer

## Root Cause (Revised Understanding)

The LiveKit SDK with `turn_detection="stt"` has an inherent latency problem:
1. Agent finishes speaking Q1
2. Deepgram STT is waiting for 1200ms of silence to finalize
3. VAD detects candidate has stopped (say 2-3s of silence)
4. LiveKit still waiting for Deepgram to finalize
5. By the time a turn is committed, the audio stream has been dormant and doesn't reinitialize properly
6. Candidate tries to speak Q1 → audio is dropped/not captured

## New Solution: VAD-Based Turn Detection

### Configuration Changes

**File**: `backend/app/interview/agent.py`

```python
# BEFORE (STT-based)
turn_handling={
    "turn_detection": "stt",
    "endpointing": {
        "min_delay": 1.5,      # Additional delay after STT finalizes
        "max_delay": 5.0,
    }
}

# AFTER (VAD-based)
turn_handling={
    "turn_detection": "vad",   # Use Voice Activity Detection instead
    "endpointing": {
        "min_delay": 0.8,      # Wait 0.8s after VAD detects end
        "max_delay": 3.0,      # Force commit after 3s
    }
}
```

### Why VAD Detection is Better

- **VAD detects speech boundaries directly** via the Silero model (already loaded at module level)
- **No dependency on Deepgram finalization** → faster turn commits
- **Audio stream reinitializes immediately** → microphone stays responsive
- **Lower latency** → 0.8s vs 1.2s+2.5s overhead
- **More reliable** → not affected by network delays from Deepgram API

### STT Endpointing Adjustment

Since VAD now handles turn detection, the STT endpointing becomes less critical:

```python
# BEFORE
endpointing_ms=1200  # Critical to prevent cutting off pauses

# AFTER
endpointing_ms=800   # Fallback only; VAD is now the primary detector
```

The STT endpointing is kept at 800ms for safety, but the VAD will trigger turn commits faster regardless.

### Frontend Microphone Management

**File**: `frontend/components/candidate/interview-room.tsx`

Added explicit microphone re-enabling on state transitions:

```tsx
// Re-enable microphone whenever agent transitions to "listening" state
useEffect(() => {
  if (state === "listening" && localParticipant && connected) {
    setTimeout(() => {
      localParticipant.setMicrophoneEnabled(true);
    }, 50);
  }
}, [state, localParticipant, connected]);
```

This ensures the audio stream is immediately active whenever the agent is ready to accept responses.

## Expected Behavior After Fix

- ✅ Agent asks question → immediately listening for response
- ✅ Candidate speaks → audio captured immediately (no frozen state)
- ✅ Candidate can pause mid-thought → VAD waits 0.8s of silence before finalizing
- ✅ Turn commits within 0.8-3s instead of 3.7-10s
- ✅ Microphone explicitly re-enabled on each question
- ✅ No STT finalization latency

## Files Modified

1. `backend/app/interview/agent.py` - Switched to VAD-based turn detection
2. `frontend/components/candidate/interview-room.tsx` - Enhanced microphone state management
3. This document

## Testing Priority

**Critical**: Run a full interview and verify:
1. Microphone responds immediately after each question
2. No freezing or delays between questions
3. Audio captures properly from first word
4. Mid-answer pauses don't cut off responses (VAD waits 0.8s)

**If issue persists**:
- Check browser console for audio permission issues
- Verify microphone is enabled in browser settings
- Check if Silero VAD is loading correctly in agent prewarm
- Look at LiveKit Agent logs for turn_detection errors

## Rollback

If VAD-based detection causes new issues, revert to:
- `turn_detection="stt"`
- `min_delay=2.5`
- `endpointing_ms=1200`

However, this will likely bring back the original freeze issue. The core problem requires either:
1. VAD-based detection (current fix), or
2. A completely different architecture (e.g., push-to-talk)

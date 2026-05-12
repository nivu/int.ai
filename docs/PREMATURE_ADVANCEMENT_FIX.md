# Premature Question Advancement Fix

## Issue
User reported that the interview advances to the next question while they're still speaking or during brief pauses mid-answer. The system was treating natural thinking pauses as end of answer.

## Root Cause
The Deepgram STT and LiveKit VAD endpointing thresholds were too aggressive:

**Previous Settings:**
- `endpointing_ms`: 3000ms (3 seconds)
- `min_delay`: 3.0 seconds
- `max_delay`: 6.0 seconds

When a candidate paused for more than 3 seconds (to think, breathe, or formulate their thoughts), Deepgram would finalize the transcript and LiveKit would commit the turn, causing the system to advance to the next question prematurely.

## Solution
Increased all silence thresholds to be much more tolerant of natural speech patterns:

**New Settings:**
- `endpointing_ms`: **8000ms (8 seconds)**
- `min_delay`: **8.0 seconds**
- `max_delay`: **30.0 seconds**

### Why These Values?

1. **8-second silence threshold**: Allows candidates to pause for up to 8 seconds to think without the system treating it as end of answer. This is a comfortable amount of time for natural thinking pauses.

2. **30-second max delay**: Prevents the system from hanging on very long answers. If a candidate speaks continuously for 30 seconds, the system will force-commit the turn. This is a safety mechanism but should rarely trigger in practice.

3. **Matching STT and VAD**: Both `endpointing_ms` (Deepgram) and `min_delay` (LiveKit VAD) are set to 8 seconds to ensure they work in sync.

## How It Works Now

1. **Candidate starts speaking**: Timer pauses immediately
2. **Candidate pauses mid-answer**: 
   - If pause < 8 seconds: System waits, no action taken
   - If pause > 8 seconds: Deepgram finalizes transcript, VAD commits turn
3. **After turn commit**: 3-second grace period starts
4. **After grace period**: 20-second no-response timer resumes from remaining time
5. **Question advances when**:
   - Candidate finishes answer (8+ seconds of silence), OR
   - 20-second timer expires with no response

## Files Modified

### `backend/app/interview/agent.py`
- Line 244: `endpointing_ms=3000` → `endpointing_ms=8000`
- Line 283: `min_delay: 3.0` → `min_delay: 8.0`
- Line 284: `max_delay: 6.0` → `max_delay: 30.0`

## Testing Checklist

After deploying this fix, test the following scenarios:

1. ✅ **Brief pause (2-3 seconds)**: Candidate pauses briefly mid-answer → system should wait, not advance
2. ✅ **Thinking pause (5-7 seconds)**: Candidate pauses to think → system should wait, not advance
3. ✅ **Long pause (8+ seconds)**: Candidate pauses for 8+ seconds → system should finalize answer and advance
4. ✅ **Continuous speech**: Candidate speaks for 20+ seconds continuously → system should not interrupt
5. ✅ **Very long answer**: Candidate speaks for 30+ seconds → system should force-commit (safety mechanism)
6. ✅ **No response**: Candidate doesn't speak at all → 20-second timer should expire and advance

## Deployment Steps

1. ✅ Updated `backend/app/interview/agent.py`
2. ⏳ Restart LiveKit worker to apply changes
3. ⏳ Test with actual interview

## Notes

- The 20-second no-response timer is independent of these settings and still works as before
- The 3-second grace period after speech stops is also independent and still works
- These changes only affect when Deepgram/VAD consider a turn "complete"
- The `max_delay=30.0` is a safety mechanism and should rarely trigger in normal interviews

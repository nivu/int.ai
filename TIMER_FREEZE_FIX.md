# Timer Freeze on Speech Fix

## Problem
According to the spec, when a candidate starts speaking, the timer should **FREEZE** (remain visible with the current value) instead of disappearing. The timer was incorrectly disappearing when the user spoke.

**Spec Requirement (Interview Session Behavior → Timer Behavior → TIMER FREEZE ON SPEECH):**
> "The moment the candidate begins speaking (detected by Voice Activity Detection), the timer MUST freeze immediately. The elapsed time is snapshotted and the remaining time is preserved. The timer MUST remain frozen for the entire duration the candidate is speaking."

**What was happening:**
- Timer starts counting down (15 seconds)
- Candidate starts speaking
- Timer **disappears** completely ❌
- Candidate stops speaking
- Grace period (3 seconds, timer hidden)
- Timer resumes from preserved value

**What should happen:**
- Timer starts counting down (15 seconds)
- Candidate starts speaking
- Timer **freezes at current value and remains visible** ✅
- Candidate stops speaking
- Grace period (3 seconds, timer hidden)
- Timer resumes from preserved value

## Root Cause

### Backend Issue
The backend was not sending the remaining time with the `user_speaking` event, so the frontend didn't know what value to display when frozen.

**File**: `backend/app/interview/entrypoint.py`

**Before:**
```python
asyncio.create_task(_publish_data(
    json.dumps({"type": "user_speaking"}).encode()
))
```

**After:**
```python
asyncio.create_task(_publish_data(
    json.dumps({
        "type": "user_speaking",
        "remaining": int(_timer_remaining[0])
    }).encode()
))
```

### Frontend Issue
The frontend was calling `clearCountdown()` when the user started speaking, which both stopped the countdown AND set `noResponseSecondsLeft` to `null`, making the timer disappear.

**File**: `frontend/components/candidate/interview-room.tsx`

## Changes Made

### Change 1: Add `freezeCountdown` function (frontend)

Created a new function that stops the countdown interval but preserves the displayed value:

```typescript
const freezeCountdown = useCallback(() => {
  // Stop the countdown interval but preserve the current value (frozen state)
  if (countdownRef.current) {
    clearInterval(countdownRef.current);
    countdownRef.current = null;
  }
  // Do NOT set noResponseSecondsLeft to null — keep the frozen value visible
}, []);
```

### Change 2: Use `freezeCountdown` on user_speaking event (frontend)

**Before:**
```typescript
if (parsed.type === "user_speaking") {
  console.log("[interview] user_speaking — clearing countdown");
  clearCountdownRef.current();
  setGraceActive(false);
  setUserSpeaking(true);
  userSpeakingRef.current = true;
}
```

**After:**
```typescript
if (parsed.type === "user_speaking") {
  console.log("[interview] user_speaking — freezing countdown at", parsed.remaining);
  freezeCountdownRef.current();
  // Update the frozen timer value if provided by backend
  if (typeof parsed.remaining === "number") {
    setNoResponseSecondsLeft(parsed.remaining);
  }
  setGraceActive(false);
  setUserSpeaking(true);
  userSpeakingRef.current = true;
}
```

### Change 3: Add visual indicator for frozen state (frontend)

Updated the timer display to show "timer paused" when frozen and disable animations:

```typescript
const isFrozen = userSpeaking; // Timer is frozen when user is speaking
return (
  <div className="flex flex-col items-center gap-1">
    <div className={cn("relative", isUrgent && !isFrozen && "animate-pulse")}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* ... circles ... */}
        <circle
          // ...
          style={{ transition: isFrozen ? "none" : "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <span>{noResponseSecondsLeft}</span>
    </div>
    <p className="text-xs text-muted-foreground">
      {isFrozen ? "timer paused" : "seconds to respond"}
    </p>
  </div>
);
```

### Change 4: Send remaining time with user_speaking event (backend)

Updated the backend to include the remaining time when publishing the `user_speaking` event.

## Verification Checklist

Test the complete timer freeze behavior:

### Test 1: Timer Freezes on Speech
1. ✅ Start interview and wait for first question
2. ✅ Wait for timer to count down to ~12 seconds
3. ✅ Start speaking
4. ✅ **VERIFY**: Timer remains visible showing 12 seconds (frozen)
5. ✅ **VERIFY**: Timer shows "timer paused" label
6. ✅ **VERIFY**: Timer does NOT count down while speaking
7. ✅ Continue speaking for 5+ seconds
8. ✅ **VERIFY**: Timer still shows 12 seconds (not counting)

### Test 2: Timer Resumes After Grace Period
1. ✅ Stop speaking (after speaking 6+ words)
2. ✅ **VERIFY**: Timer disappears (grace period active)
3. ✅ Wait 3 seconds (grace period)
4. ✅ Wait 2-4 seconds (confirmation silence based on word count)
5. ✅ **VERIFY**: Question advances to next question

### Test 3: Timer Resumes on Same Question (< 6 words)
1. ✅ Wait for timer to count down to ~10 seconds
2. ✅ Say 3-4 words and stop
3. ✅ **VERIFY**: Timer disappears (grace period active)
4. ✅ Wait 3 seconds (grace period completes)
5. ✅ **VERIFY**: Timer reappears showing ~10 seconds
6. ✅ **VERIFY**: Timer resumes counting down from 10 seconds
7. ✅ **VERIFY**: Question does NOT advance (same question)

### Test 4: Multiple Freeze/Resume Cycles
1. ✅ Wait for timer to show 14 seconds
2. ✅ Speak 3 words, stop
3. ✅ **VERIFY**: Timer frozen at 14s → grace period → timer resumes at 14s
4. ✅ Wait for timer to show 10 seconds
5. ✅ Speak 4 words, stop
6. ✅ **VERIFY**: Timer frozen at 10s → grace period → timer resumes at 10s
7. ✅ Wait for timer to show 6 seconds
8. ✅ Speak 8 words (complete answer)
9. ✅ **VERIFY**: Timer frozen at 6s → grace period → question advances

### Test 5: Timer Expires Correctly
1. ✅ Wait for new question
2. ✅ Do NOT speak at all
3. ✅ **VERIFY**: Timer counts down from 15 to 0
4. ✅ **VERIFY**: At 0, agent says "I didn't hear a response, so let's move on"
5. ✅ **VERIFY**: Question advances

## Spec Compliance

This fix ensures the implementation matches these spec requirements:

### ✅ TIMER FREEZE ON SPEECH
- ✅ Timer freezes immediately when candidate speaks
- ✅ Elapsed time is snapshotted and remaining time is preserved
- ✅ Timer remains frozen (visible) for entire duration of speech
- ✅ No countdown progression while speech is detected

### ✅ GRACE PERIOD AFTER SPEECH
- ✅ Timer hidden during grace period (3 seconds)
- ✅ Grace period allows for natural thinking pauses

### ✅ TIMER RESUME (INSUFFICIENT WORDS)
- ✅ If candidate spoke < 6 words, timer resumes from frozen value
- ✅ Timer continues from remaining time (not reset to 15)
- ✅ Cycle can repeat: speak → freeze → stop → grace → resume

### ✅ Visual Feedback
- ✅ Timer visible and counting when agent is listening
- ✅ Timer visible and frozen when candidate is speaking
- ✅ Timer hidden during grace period
- ✅ Clear label indicating frozen state ("timer paused")

## Files Modified

1. `backend/app/interview/entrypoint.py` - Added remaining time to user_speaking event
2. `frontend/components/candidate/interview-room.tsx` - Added freezeCountdown function and visual frozen state indicator

## Preserved Behavior

- ✅ Timer still starts when agent finishes speaking
- ✅ Timer still resets to 15 seconds on new question
- ✅ Grace period still works (3s + tiered silence)
- ✅ Smart advancement still works (word count-based)
- ✅ Timer expiration still works (advances on timeout)
- ✅ Question counter still works correctly
- ✅ Tab switch detection still works

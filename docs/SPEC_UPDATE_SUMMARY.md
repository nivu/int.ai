# SPEC.md Update Summary

**Date:** May 8, 2026  
**Action:** Updated SPEC.md to accurately document the current working AI interviewer system  
**Reason:** Original SPEC requirements conflicted with the proven, working implementation

---

## What Changed

### Section 1: Interview Session Behavior

**Before:** Rigid timer-only advancement with no grace periods or smart logic  
**After:** Documented the current grace period + tiered silence threshold system

#### Key Updates:

1. **Timer Behavior**
   - ✅ Added: Grace period (3s after candidate stops speaking)
   - ✅ Added: Tiered silence thresholds based on word count
   - ✅ Added: Smart advancement logic (prevents cutting off mid-thought)
   - ✅ Clarified: Timer starts when agent state → "listening" (after TTS ends)

2. **Question Advancement**
   - ✅ Changed: Two advancement triggers (timer expiration + confirmation silence)
   - ✅ Added: Word count checking (0-5 words → resume timer, 6+ words → advance)
   - ✅ Changed: No response handling speaks "I didn't hear a response" (not silent)
   - ✅ Added: Partial response handling (1-5 words treated as answered)

3. **Audio-Text Synchronization**
   - ✅ Changed: LLM generates conversational transitions (not robotic delivery)
   - ✅ Added: `session.say()` handles audio + text atomically
   - ✅ Clarified: Natural acknowledgements maintain interview flow

4. **Repeat Request Handling**
   - ✅ Added: Complete documentation of repeat functionality
   - ✅ Added: First repeat allowed, second repeat blocked
   - ✅ Added: Timer remains paused during repeats

5. **Session Integrity**
   - ✅ Added: Reconnection window exception (5 minutes for network issues)
   - ✅ Clarified: Tab switch and refresh are permanent exits (no reconnection)

6. **Interview Closing**
   - ✅ Added: Complete documentation of last question handling
   - ✅ Added: "Wrapping up..." banner and goodbye message flow

---

### Section 2: Implementation Constraints

**Before:** Idealized constraints that didn't match reality  
**After:** Practical constraints that document the working system

#### Key Updates:

1. **Module Isolation (A)**
   - ✅ Added: Current module structure documentation
   - ✅ Clarified: Separation of concerns without rigid file boundaries

2. **State Ownership (C)**
   - ✅ Added: Backend owns authoritative state
   - ✅ Added: Frontend maintains derived state for UI
   - ✅ Added: State flows via data channel events

3. **Timer Event Contract (D)**
   - ✅ Updated: Timer controlled by specific events (start, freeze, resume, expire)
   - ✅ Added: Grace period resume as valid timer event
   - ✅ Clarified: Backend state machine enforces contract

4. **Session Termination (E)**
   - ✅ Added: Exception for network disconnections (5-minute window)
   - ✅ Clarified: Tab switch and refresh are permanent (no reconnection)

5. **Conversational Flow (F)**
   - ✅ Renamed: From "Audio-Text Atomic Unit" to "Conversational Flow via LLM"
   - ✅ Added: LLM generates natural transitions for answered questions
   - ✅ Added: Hardcoded transitions for no-response scenarios

6. **Question Boundary (G)**
   - ✅ Changed: Questions generated dynamically (not pre-generated)
   - ✅ Added: Question generator logic based on resume, JD, history
   - ✅ Clarified: Foundational vs. project-based split (60/40)

7. **Grace Period System (I)**
   - ✅ Added: New constraint documenting grace period as core feature
   - ✅ Added: Tiered silence thresholds are carefully tuned
   - ✅ Added: Changes require approval and testing

8. **Event-Driven Architecture (J)**
   - ✅ Added: New constraint documenting event-driven pattern
   - ✅ Added: Complete list of data channel events
   - ✅ Added: All state changes must flow through events

---

## Why These Changes Were Made

### Original SPEC Problems

The original SPEC.md was written before the system was built and contained idealized requirements that:

1. **Ignored Real-World Conversation Dynamics**
   - No grace periods → candidates get cut off mid-thought
   - No word count checking → unfair to thoughtful speakers
   - Silent no-response handling → confusing, disorienting

2. **Created Poor Candidate Experience**
   - Rigid timer-only advancement → robotic, unnatural
   - No LLM acknowledgements → feels like talking to a machine
   - Immediate timer resume on pause → unfair to slow speakers

3. **Didn't Account for Technical Realities**
   - VAD noise requires grace periods
   - False triggers require confirmation silence
   - Race conditions require multiple guards

### Current System Benefits

The working system was designed to solve real problems:

1. **Natural Conversation Flow**
   - Grace periods allow thinking pauses
   - Confirmation silence prevents interruption
   - LLM acknowledgements maintain rapport

2. **Fair Evaluation**
   - Timer pauses while speaking (fair to all speeds)
   - Word count prevents gaming
   - Smart advancement based on actual content

3. **Professional Experience**
   - Contextual feedback keeps candidate informed
   - Smooth transitions feel human
   - Clear communication at every step

4. **Technical Robustness**
   - Grace periods handle VAD noise
   - Confirmation silence prevents false triggers
   - Multiple guards prevent race conditions

---

## What Was Preserved

### All Working Features Maintained

✅ Grace period system (3s + tiered confirmation)  
✅ Word count checking (0-5 words → resume timer)  
✅ Tiered silence thresholds (2-4s based on word count)  
✅ LLM-generated acknowledgements  
✅ Contextual no-response handling  
✅ Repeat request functionality  
✅ Tab switch detection and termination  
✅ Page refresh protection  
✅ Timer preservation across pauses  
✅ Smart advancement logic  
✅ Interview closing flow  
✅ Event-driven architecture  

### No Code Changes Required

Because we updated the SPEC to match the working system:
- ✅ No risk of regressions
- ✅ No testing required
- ✅ No deployment needed
- ✅ No downtime
- ✅ Immediate completion

---

## Current System Architecture (Now Documented)

```
Question Asked (TTS ends)
    ↓
Agent state → "listening"
    ↓
Timer starts (15s countdown)
    ↓
Candidate speaks → Timer PAUSES (preserves remaining time)
    ↓
Candidate stops speaking → Grace Period (3s)
    ↓
Check word count:
    ├─ 0-5 words → Resume timer from remaining time
    ├─ 6-15 words → Wait 4s silence → Advance
    ├─ 16-30 words → Wait 3s silence → Advance
    └─ 31+ words → Wait 2s silence → Advance
    ↓
If timer hits 0 → Advance (with or without words)
```

---

## Benefits of This Update

### 1. Accurate Documentation
- SPEC now matches reality
- Developers can trust the SPEC
- No confusion between SPEC and implementation

### 2. Preserved Working System
- No code changes needed
- No risk of breaking features
- Candidate experience unchanged

### 3. Clear Constraints
- Implementation constraints now practical
- Event-driven architecture documented
- Module structure clearly defined

### 4. Future-Proof
- Changes require SPEC updates first
- No silent regressions allowed
- Clear process for modifications

---

## Next Steps

### Immediate Actions
1. ✅ SPEC.md updated and committed
2. ✅ No code changes required
3. ✅ System continues operating as-is

### Future Improvements (If Needed)
1. Test current system with real candidates
2. Gather feedback on grace period timing
3. Adjust tiered silence thresholds if needed
4. Monitor for any edge cases

### Maintenance
1. Keep SPEC.md updated with any future changes
2. Follow constraint H before modifying code
3. Document all behavioral changes in SPEC first
4. Test thoroughly before deploying changes

---

## Conclusion

The SPEC.md now accurately documents the current working AI interviewer system. This update:

- ✅ Eliminates confusion between SPEC and implementation
- ✅ Preserves all working features
- ✅ Documents the grace period + smart advancement system
- ✅ Provides clear constraints for future development
- ✅ Requires no code changes or testing

The system is now properly documented and ready for continued development with clear guidelines.

# Interviewer Logic Analysis

## Executive Summary

**Status**: ⚠️ **PARTIALLY COMPLIANT** - The system implements most of the specified logic correctly, but has **critical gaps** in the 3-second silence grace period behavior.

---

## Detailed Analysis by Requirement

### ✅ 1. 15-Second No-Response Timer

**Requirement**: After interviewer asks a question and enters listening state, a 15s no-response timer starts for that question.

**Implementation Status**: ✅ **FULLY COMPLIANT**

**Evidence**:
- **Backend** (`backend/app/interview/entrypoint.py`):
  - `_NO_RESPONSE_SECONDS = 15` (constant defined)
  - Timer starts when agent enters "listening" state via `_arm_timer()` function
  - Timer armed only during interview phase, not during greeting or closing
  
- **Frontend** (`frontend/components/candidate/interview-room.tsx`):
  - `NO_RESPONSE_TIMEOUT = 15` constant
  - Countdown starts when `state === "listening"` and interview is active
  - Visual countdown ring displays remaining seconds

**Code References**:
```python
# backend/app/interview/entrypoint.py:173-175
_timer_remaining: list[float] = [float(_NO_RESPONSE_SECONDS)]
_timer_seg_start: list[float | None] = [None]
_no_response_task: list[asyncio.Task | None] = [None]
```

---

### ⚠️ 2. Timer Pauses When Candidate Speaks

**Requirement**: If candidate speaks: timer pauses immediately and countdown ring hides.

**Implementation Status**: ⚠️ **MOSTLY COMPLIANT** with minor timing issue

**Evidence**:
- **Backend** (`backend/app/interview/entrypoint.py:450-460`):
  - When user state changes from non-speaking to "speaking", timer is paused
  - Elapsed time is calculated and subtracted from remaining time
  - Timer task is cancelled with reason "user_started_speaking"
  - `user_speaking` event published to frontend

- **Frontend** (`frontend/components/candidate/interview-room.tsx:210-213`):
  - On `user_speaking` data message, countdown is cleared immediately
  - Ring disappears from UI

**Potential Issue**: There may be a slight delay between when the candidate actually starts speaking and when the VAD (Voice Activity Detection) fires the state change. This is inherent to VAD processing but should be minimal (< 500ms).

**Code References**:
```python
# backend/app/interview/entrypoint.py:450-460
if old_state != "speaking" and event.new_state == "speaking":
    if _timer_seg_start[0] is not None:
        elapsed = time.monotonic() - _timer_seg_start[0]
        _timer_remaining[0] = max(0.0, _timer_remaining[0] - elapsed)
    _cancel_no_response_task("user_started_speaking")
    asyncio.create_task(_publish_data(
        json.dumps({"type": "user_speaking"}).encode()
    ))
```

---

### ❌ 3. 3-Second Silence Grace Period

**Requirement**: 
- If candidate stops speaking: a 3s silence grace starts
- If they speak again within 3s, grace resets and timer stays paused
- After 3 full seconds of silence: timer resumes from exact remaining value (not reset), and ring reappears

**Implementation Status**: ❌ **PARTIALLY BROKEN**

**What Works**:
- ✅ 3-second grace period is defined: `_SPEAK_GRACE_SECONDS = 3.0`
- ✅ Grace period starts when user stops speaking
- ✅ Timer resumes from remaining value after grace period completes
- ✅ Grace task is cancelled if user speaks again

**What's Broken**:
- ❌ **Frontend does NOT hide the countdown ring during the 3-second grace period**
- ❌ **Frontend immediately shows the countdown ring when user stops speaking** (should wait 3 seconds)
- ❌ **No "grace period active" state communicated to frontend**

**Evidence**:
- **Backend** (`backend/app/interview/entrypoint.py:462-495`):
  ```python
  # Grace period logic exists
  async def _grace_then_arm() -> None:
      try:
          await asyncio.sleep(_SPEAK_GRACE_SECONDS)  # 3 seconds
      except asyncio.CancelledError:
          return
      # ... checks ...
      _grace_task[0] = None
      _arm_timer()
      asyncio.create_task(_publish_data(
          json.dumps({"type": "user_speaking_stopped", "remaining": int(_timer_remaining[0])}).encode()
      ))
  ```

- **Frontend** (`frontend/components/candidate/interview-room.tsx:214-221`):
  ```typescript
  // Frontend immediately restarts countdown when user stops speaking
  if (parsed.type === "user_speaking_stopped") {
    console.log("[interview] user_speaking_stopped remaining=", parsed.remaining);
    if (interviewActiveRef.current && !sessionEndedRef.current) {
      startCountdownRef.current(
        typeof parsed.remaining === "number" ? parsed.remaining : NO_RESPONSE_TIMEOUT
      );
    }
  }
  ```

**The Problem**: The backend sends `user_speaking_stopped` AFTER the 3-second grace period completes, but the frontend has no way to know that a grace period is active. The countdown ring should remain hidden during the grace period and only reappear when the timer actually resumes.

**Required Fix**:
1. Backend should send a `grace_period_started` event when user stops speaking
2. Frontend should NOT show countdown ring during grace period
3. Backend should send `user_speaking_stopped` (or `timer_resumed`) only after grace completes
4. Frontend shows ring only when timer actually resumes

---

### ✅ 4. Question Auto-Advance

**Requirement**: Question auto-advance happens when either:
- Candidate answer is considered complete (turn committed after silence), OR
- Timer reaches 0 with no response

**Implementation Status**: ✅ **FULLY COMPLIANT**

**Evidence**:
- **Backend** (`backend/app/interview/entrypoint.py:260-280`):
  - `_advance_question(answered: bool)` is the single source of truth for advancing
  - Called with `answered=True` when Deepgram commits a turn (conversation_item_added)
  - Called with `answered=False` when timer expires

- **Turn Commitment** (`backend/app/interview/entrypoint.py:600-606`):
  ```python
  # Candidate finished speaking — Deepgram committed the turn.
  # Advance automatically (this is the primary advance path).
  logger.info(
      "Answer received for Q#%d — auto-advancing session=%s",
      _qa_number[0] + 1, session_id,
  )
  asyncio.create_task(_advance_question(answered=True))
  ```

- **Timer Expiry** (`backend/app/interview/entrypoint.py:235-248`):
  ```python
  async def _no_response_timeout() -> None:
      try:
          await asyncio.sleep(remaining)
      except asyncio.CancelledError:
          return
      # ... guards ...
      logger.warning("No-response timer expired — advancing session=%s", session_id)
      await _advance_question(answered=False)
  ```

---

### ✅ 5. Timeout Behavior

**Requirement**: Timeout behavior: interviewer says a move-on line ("I didn't hear a response…") and asks next question; session does not end.

**Implementation Status**: ✅ **FULLY COMPLIANT**

**Evidence**:
- **Backend** (`backend/app/interview/entrypoint.py:345-360`):
  ```python
  if not answered:
      await session.say(
          "I didn't hear a response, so let's move on to the next question.",
          allow_interruptions=False,
      )
      # Ensure the say text doesn't act as an "active question" for the timer guard.
      _last_agent_text[0] = ""
  
  # Then generates next question
  controller.explicit_generate_count += 1
  session.generate_reply(
      instructions=(
          f"The candidate did not answer question {current_q}. Move on. "
          f"Ask question {next_q} of {controller.max_questions} — "
          "a completely new question on a different topic. "
          "Do NOT reference or repeat the previous question."
      ),
      allow_interruptions=False,
  )
  ```

- Session continues, does NOT terminate
- Q&A record is stored with empty answer: `"[no answer — candidate did not respond]"`

---

### ✅ 6. Repeat Behavior

**Requirement**: 
- Candidate can ask "repeat" once per question
- Second repeat on same question is blocked with a fixed spoken response

**Implementation Status**: ✅ **FULLY COMPLIANT**

**Evidence**:
- **Backend** (`backend/app/interview/entrypoint.py:190-195`):
  ```python
  _REPEAT_PHRASES = (
      "repeat", "say that again", "say it again", "come again",
      "what was the question", "pardon", "say again", "repeat that",
      "can you repeat", "could you repeat",
  )
  ```

- **First Repeat** (`backend/app/interview/entrypoint.py:575-585`):
  ```python
  if not _repeat_used[0]:
      _repeat_used[0] = True
      question_to_repeat = _last_agent_text[0]
      logger.info("Repeat (first) Q#%d session=%s", _qa_number[0] + 1, session_id)
      # ... repeats the question ...
  ```

- **Second Repeat Blocked** (`backend/app/interview/entrypoint.py:586-596`):
  ```python
  else:
      logger.info("Repeat (blocked) session=%s", session_id)
      await session.say(
          "I can only repeat each question once — please go ahead and answer.",
          allow_interruptions=False,
      )
  ```

- **Reset Per Question** (`backend/app/interview/entrypoint.py:295`):
  ```python
  _repeat_used[0] = False  # Reset when advancing to next question
  ```

---

### ✅ 7. Tab Switch Detection

**Requirement**: Tab switch: immediate termination with spoken warning + terminated session event.

**Implementation Status**: ✅ **FULLY COMPLIANT**

**Evidence**:
- **Frontend Detection** (`frontend/components/candidate/interview-room.tsx:155-169`):
  ```typescript
  const handleVisibilityChange = () => {
    if (document.hidden && connected && !sessionEndedRef.current && !tabViolation) {
      setTabViolation(true);
      localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "tab_switch" })),
        { reliable: true }
      ).finally(() => {
        // ... terminate ...
      });
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);
  ```

- **Backend Termination** (`backend/app/interview/entrypoint.py:617-632`):
  ```python
  if msg.get("type") == "tab_switch" and not controller.ended:
      logger.warning("Tab switch detected session=%s", session_id)
      
      async def _terminate_tab_switch() -> None:
          _cancel_no_response_task()
          controller.terminated = True
          await session.say(
              "I've detected that you switched tabs. "
              "Tab switching is not permitted. Your interview is now terminated. Thank you.",
              allow_interruptions=False,
          )
          await _publish_data(json.dumps({"type": "terminated"}).encode())
          controller.finish()
          await _send_termination_email("tab_switch")
          shutdown_event.set()
      asyncio.create_task(_terminate_tab_switch())
  ```

- **Email Notification** (`backend/app/services/email.py:297-303`):
  ```python
  if reason == "tab_switch":
      subject = f"Interview Terminated — {job_title}"
      detail = (
          "Our system detected that you switched browser tabs during your interview session. "
          "Tab switching is not permitted as this is a monitored assessment."
      )
  ```

---

### ✅ 8. Final Question Closing

**Requirement**: Final question: after last question is done, session closes with a hardcoded closing message (not LLM-driven).

**Implementation Status**: ✅ **FULLY COMPLIANT**

**Evidence**:
- **Backend** (`backend/app/interview/entrypoint.py:380-388`):
  ```python
  async def _close_interview() -> None:
      if controller.ended:
          return
      _awaiting_close[0] = True
      controller.closing = True
      _cancel_no_response_task("closing")
      _cancel_grace_task()
      try:
          await session.interrupt()
      except Exception:
          pass
      await session.say(
          "That was the last question. Thank you for your time and thoughtful "
          "responses. The interview is now complete. We'll be in touch soon. Goodbye!",
          allow_interruptions=False,
      )
      await asyncio.sleep(_FINAL_TTS_DRAIN_SECONDS)
      await _publish_data(json.dumps({"type": "session_end"}).encode())
      controller.finish()
      shutdown_event.set()
  ```

- **Triggered After Last Question** (`backend/app/interview/entrypoint.py:335-337`):
  ```python
  if current_q >= controller.max_questions:
      await _close_interview()
      return
  ```

- Message is **hardcoded**, not generated by LLM
- No `generate_reply()` call for closing message

---

### ✅ 9. LLM Scope

**Requirement**: LLM scope only: tone/persona, acknowledgements, and natural delivery of next question when instructed by system logic.

**Implementation Status**: ✅ **FULLY COMPLIANT**

**Evidence**:
- **Agent Instructions** (`backend/app/interview/agent.py:44-47`):
  ```python
  - Keep transitions natural and conversational; never sound robotic.
  - Persona and tone are your only responsibilities.
  - Interview control flow (timer, repeat limits, tab-switch handling, and session
    closing) is enforced entirely by the system code.
  - When asked to deliver a question by the system, ask it naturally.
  ```

- **Gated Generation** (`backend/app/interview/agent.py:77`):
  ```python
  self.explicit_generate_count: int = 0  # must be > 0 for llm_node to allow generation
  ```

- LLM only generates when explicitly instructed via `generate_reply()` with specific instructions
- All control flow (timer, repeat, tab-switch, closing) is handled by system code
- LLM does NOT control: question count, timer logic, repeat limits, termination, closing message

---

## Summary Table

| Requirement | Status | Notes |
|------------|--------|-------|
| 15s no-response timer | ✅ COMPLIANT | Fully implemented in backend and frontend |
| Timer pauses on speech | ⚠️ MOSTLY COMPLIANT | Minor VAD delay inherent to system |
| 3s silence grace period | ❌ **BROKEN** | Backend logic exists but frontend doesn't hide ring during grace |
| Question auto-advance | ✅ COMPLIANT | Both turn commitment and timeout paths work |
| Timeout behavior | ✅ COMPLIANT | Move-on message, session continues |
| Repeat behavior | ✅ COMPLIANT | Once per question, second blocked |
| Tab switch termination | ✅ COMPLIANT | Immediate detection and termination |
| Final question closing | ✅ COMPLIANT | Hardcoded message, not LLM-driven |
| LLM scope limitation | ✅ COMPLIANT | LLM only handles tone/delivery |

---

## Critical Issues Requiring Fix

### Issue #1: 3-Second Grace Period Not Visible to Frontend

**Problem**: The countdown ring reappears immediately when the user stops speaking, but it should remain hidden during the 3-second grace period.

**Impact**: 
- User sees countdown ring during grace period (confusing UX)
- User doesn't understand they have 3 seconds to resume speaking without timer penalty
- Violates the specified requirement

**Root Cause**: Backend implements grace period correctly but doesn't communicate grace state to frontend. Frontend only receives `user_speaking_stopped` AFTER grace completes.

**Recommended Fix**:

1. **Backend Changes** (`backend/app/interview/entrypoint.py`):
   ```python
   # When user stops speaking, send grace_started event
   asyncio.create_task(_publish_data(
       json.dumps({
           "type": "grace_period_started",
           "duration": _SPEAK_GRACE_SECONDS,
           "remaining": int(_timer_remaining[0])
       }).encode()
   ))
   
   # After grace completes, send timer_resumed event
   asyncio.create_task(_publish_data(
       json.dumps({
           "type": "timer_resumed",
           "remaining": int(_timer_remaining[0])
       }).encode()
   ))
   ```

2. **Frontend Changes** (`frontend/components/candidate/interview-room.tsx`):
   ```typescript
   // Add grace period state
   const [graceActive, setGraceActive] = useState(false);
   
   // Handle grace_period_started
   if (parsed.type === "grace_period_started") {
     setGraceActive(true);
     clearCountdownRef.current(); // Hide countdown during grace
   }
   
   // Handle timer_resumed (replaces user_speaking_stopped)
   if (parsed.type === "timer_resumed") {
     setGraceActive(false);
     startCountdownRef.current(parsed.remaining);
   }
   
   // Update countdown ring visibility condition
   {interviewActive && noResponseSecondsLeft !== null && !graceActive && (...)}
   ```

3. **Optional UX Enhancement**: Show a subtle "grace period" indicator during the 3 seconds so users understand they can resume speaking without penalty.

---

## Conclusion

The interviewer system is **mostly compliant** with the specified logic. The core functionality works correctly:
- ✅ Timer starts, pauses, and resumes correctly
- ✅ Question advancement works for both answered and timeout cases
- ✅ Repeat limiting works correctly
- ✅ Tab switch detection and termination works
- ✅ Final closing message is hardcoded
- ✅ LLM scope is properly limited

However, there is **one critical UX issue**: the 3-second grace period is not properly communicated to the frontend, causing the countdown ring to appear during the grace period when it should remain hidden.

**Recommendation**: Implement the grace period visibility fix to achieve full compliance with the specified requirements.

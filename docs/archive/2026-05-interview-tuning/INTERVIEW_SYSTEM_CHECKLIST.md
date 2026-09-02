# Interview System Checklist

## ✅ CRITICAL FLOW - Must Work Perfectly

### 1. **Session Start & Greeting**
- [ ] Agent connects to LiveKit room
- [ ] Agent speaks greeting with rules (15s timer, no tab switch, can repeat once)
- [ ] Greeting mentions correct timer duration (15 seconds, not 20)
- [ ] Frontend shows "AI Interviewer is speaking..." during greeting
- [ ] No timer shows during greeting (interview not active yet)

### 2. **Greeting → First Question Transition**
- [ ] Candidate says "yes" or "ready" or any response
- [ ] `conversation_item_added` fires with role="user"
- [ ] Phase transitions from "greeting" to "interview"
- [ ] `generate_reply()` called with "Ask the first question now"
- [ ] Agent generates and speaks Q1
- [ ] Frontend receives `question_progress` event with `current: 1`
- [ ] Frontend shows "Question 1 of X"

### 3. **Timer Behavior - Question Start**
- [ ] Agent finishes speaking Q1 → agent state changes to "listening"
- [ ] `_arm_timer()` called (guards: interview phase, question active, no timer running)
- [ ] Backend sends `timer_started` event with `remaining: 15`
- [ ] Frontend receives event and starts countdown ring from 15
- [ ] Ring shows green initially, yellow at ≤10s, red at ≤5s with pulse

### 4. **Timer Behavior - Candidate Speaks**
- [ ] Candidate starts speaking → user state changes to "speaking"
- [ ] Timer pauses immediately (elapsed time snapshotted)
- [ ] Backend sends `user_speaking` event
- [ ] Frontend clears countdown ring (no timer visible while speaking)
- [ ] `userSpeaking` state set to `true` (blocks fallback timer)

### 5. **Timer Behavior - Candidate Stops Speaking**
- [ ] Candidate stops speaking → user state changes to "listening"
- [ ] 3-second grace period starts
- [ ] Backend sends `grace_period_started` event with `duration: 3.0`
- [ ] Frontend sets `graceActive: true` (blocks fallback timer)
- [ ] Timer ring stays hidden during grace period

### 6. **Grace Period - Short Answer (< 6 words)**
- [ ] Grace period ends after 3s
- [ ] Word count checked: < 6 words
- [ ] Timer resumes from remaining time (not reset to 15)
- [ ] Backend sends `timer_resumed` event with preserved `remaining` value
- [ ] Frontend shows countdown ring again from remaining time
- [ ] `graceActive` set to `false`, `userSpeaking` set to `false`

### 7. **Grace Period - Medium Answer (6-15 words)**
- [ ] Grace period ends after 3s
- [ ] Word count checked: 6-15 words
- [ ] Additional 4s silence confirmation starts
- [ ] Backend sends `grace_period_started` with `duration: 4.0`
- [ ] If candidate speaks again during 4s → grace cancelled, restart from step 4
- [ ] If 4s silence confirmed → advance to next question (`answered: true`)

### 8. **Grace Period - Long Answer (16-30 words)**
- [ ] Grace period ends after 3s
- [ ] Word count checked: 16-30 words
- [ ] Additional 3s silence confirmation starts
- [ ] If 3s silence confirmed → advance to next question

### 9. **Grace Period - Very Long Answer (31+ words)**
- [ ] Grace period ends after 3s
- [ ] Word count checked: 31+ words
- [ ] Additional 2s silence confirmation starts
- [ ] If 2s silence confirmed → advance to next question

### 10. **Question Advancement - Answered**
- [ ] `_advance_question(answered=True)` called
- [ ] Current Q&A stored in database
- [ ] Answer added to conversation history
- [ ] Question counter incremented
- [ ] Timer reset to 15s for next question
- [ ] `question_progress` sent with next question number
- [ ] `generate_reply()` called with acknowledgement + next question instruction
- [ ] Agent speaks brief acknowledgement (1 sentence max)
- [ ] Agent asks next question
- [ ] Agent → "listening" → timer arms for new question

### 11. **Question Advancement - No Answer (Timer Expires)**
- [ ] 15s timer expires with 0 words spoken
- [ ] `_advance_question(answered=False)` called
- [ ] Q&A stored with empty answer, marked as skipped
- [ ] Question counter incremented
- [ ] `question_progress` sent
- [ ] **NO `generate_reply()` call** (bypass LLM entirely)
- [ ] Agent speaks hardcoded: "I didn't hear a response, so let's move on. [next question]"
- [ ] Next question fetched directly from `question_gen.generate_next_question()`
- [ ] Agent → "listening" → timer arms for new question

### 12. **Question Advancement - Partial Answer (Timer Expires with Words)**
- [ ] 15s timer expires with 1-5 words spoken
- [ ] `_advance_question(answered=True)` called (treat as answered, not skipped)
- [ ] Normal LLM acknowledgement path (not "I didn't hear a response")
- [ ] Agent acknowledges + asks next question

### 13. **Repeat Request**
- [ ] Candidate says "repeat" or "say that again" (≤15 words, contains repeat phrase)
- [ ] `_is_repeat_request()` returns true
- [ ] First repeat: agent interrupts itself, repeats question verbatim
- [ ] Timer stays paused at current remaining value (not reset)
- [ ] Second repeat on same question: "I can only repeat each question once"
- [ ] Timer still stays paused

### 14. **Last Question → Closing**
- [ ] Last question answered (Q# == max_questions)
- [ ] `_close_interview()` called
- [ ] Backend sends `interview_closing` event immediately
- [ ] Frontend clears timer, shows "Wrapping up your interview..." banner
- [ ] Agent speaks goodbye message (full 3s drain time)
- [ ] Backend sends `session_end` event
- [ ] Frontend shows "Interview Complete" screen
- [ ] `sessionStorage.removeItem("interview_room")` called
- [ ] Redirect to `/portal`

### 15. **Tab Switch Detection**
- [ ] Candidate switches tabs during active interview
- [ ] `visibilitychange` event fires with `document.hidden === true`
- [ ] `tabViolation` state set to `true`
- [ ] **`sessionStorage.removeItem("interview_room")` called immediately**
- [ ] `tab_switch` message published to backend
- [ ] Room disconnects after 1.5s
- [ ] Frontend shows "Tab Switch Detected" screen (red warning icon)
- [ ] Backend receives `tab_switch`, sets status to `terminated_tab_switch`
- [ ] Backend sends termination email
- [ ] **Any refresh from this screen → redirects to `/portal` (no re-entry)**

### 16. **Page Refresh Protection**
- [ ] User refreshes page during active interview
- [ ] `beforeunload` event fires
- [ ] **`sessionStorage.removeItem("interview_room")` called synchronously**
- [ ] Abandon beacon sent to backend (if session active)
- [ ] Page reloads → session page finds no storage → redirects to `/portal`
- [ ] Backend marks session as `terminated_abandoned`

### 17. **Back Button Protection**
- [ ] User presses back button during interview
- [ ] `popstate` event fires
- [ ] History state re-pushed (URL stays on session page)
- [ ] Abandon beacon sent
- [ ] `sessionStorage` cleared
- [ ] Redirect to `/portal?session_ended=1`

### 18. **Frontend Timer Fallback**
- [ ] Primary: Backend `timer_started` event triggers countdown
- [ ] Fallback: Agent state "listening" + interview active + no countdown running + no grace active + **user not speaking**
- [ ] Fallback blocked when `userSpeaking === true`
- [ ] Fallback blocked when `graceActive === true`
- [ ] Fallback blocked when countdown already running

### 19. **Agent State Tracking**
- [ ] Agent state tracked: "initializing" → "speaking" → "listening" → "thinking" → "speaking"
- [ ] User state tracked: "listening" → "speaking" → "listening"
- [ ] `_last_agent_text[0]` stores current question text
- [ ] `_last_agent_text[0]` cleared after advancement (prevents double-advance)
- [ ] `_advancing[0]` flag prevents concurrent advancement

### 20. **Transcript Accumulation**
- [ ] `user_input_transcribed` fires for each Deepgram segment
- [ ] Only `is_final` segments appended to `_current_answer_parts`
- [ ] Word count calculated from all accumulated parts
- [ ] Parts cleared after advancement
- [ ] `conversation_item_added` does NOT advance (only tracks for repeat detection)

## 🔧 CONFIGURATION VERIFICATION

### Backend Constants
- [ ] `_NO_RESPONSE_SECONDS = 15` (not 20)
- [ ] `_SPEAK_GRACE_SECONDS = 3.0`
- [ ] Deepgram `endpointing_ms = 3500` (3.5s)
- [ ] VAD `min_delay = 3.5`
- [ ] VAD `max_delay = 30.0`

### Frontend Constants
- [ ] `NO_RESPONSE_TIMEOUT = 15` (not 20)
- [ ] Reminder text says "15 seconds" (not 20)
- [ ] Greeting audio says "15 seconds" (uses `_NO_RESPONSE_SECONDS`)

## 🐛 KNOWN ISSUES TO AVOID

### ❌ Don't Do This
1. **Never call `_advance_question()` from `conversation_item_added`** — causes race with grace logic
2. **Never reset timer to full 15s mid-answer** — must preserve remaining time
3. **Never let LLM generate acknowledgement for unanswered questions** — causes "Fantastic explanation!" on silence
4. **Never arm timer without checking `_last_agent_text[0]`** — causes premature timer during question generation
5. **Never let frontend fallback fire while user is speaking** — causes timer to count during speech
6. **Never leave `sessionStorage` intact on refresh** — allows re-entry to terminated sessions

### ✅ Do This Instead
1. Grace/silence logic is the ONLY advancement path for answered questions
2. Timer pause snapshots elapsed time, resume uses remaining time
3. Unanswered questions bypass LLM, use hardcoded move-on + direct question fetch
4. Timer arming checks question is active before arming
5. Frontend tracks `userSpeaking` state to block fallback
6. `beforeunload` always clears `sessionStorage` synchronously

## 📊 TESTING SCENARIOS

### Scenario 1: Normal Interview Flow
1. Start interview → hear greeting
2. Say "yes" → Q1 asked, timer shows 15s
3. Start speaking → timer disappears
4. Stop speaking → 3s grace (no timer)
5. Speak 10 words → stop → 3s grace → 4s confirmation → advance
6. Repeat for all questions
7. Last question → "Wrapping up..." → "Interview Complete" → portal

### Scenario 2: Silent Question
1. Q1 asked, timer shows 15s
2. Stay completely silent
3. Timer counts down 15 → 0
4. Hear "I didn't hear a response, so let's move on. [Q2]"
5. Timer shows 15s for Q2

### Scenario 3: Partial Answer + Timeout
1. Q1 asked, timer shows 15s
2. Say 3 words, stop
3. Grace 3s → timer resumes from ~12s
4. Stay silent, timer counts to 0
5. Hear acknowledgement + Q2 (NOT "I didn't hear a response")

### Scenario 4: Tab Switch
1. Q2 active, timer showing
2. Switch to another tab
3. See "Tab Switch Detected" screen immediately
4. Refresh page → redirected to portal (not back to interview)

### Scenario 5: Page Refresh
1. Q3 active, timer showing
2. Press F5 / Cmd+R
3. Page reloads → redirected to portal
4. Session marked as abandoned in backend

### Scenario 6: Repeat Request
1. Q1 asked
2. Say "repeat"
3. Hear Q1 again verbatim
4. Timer stays at same remaining value
5. Say "repeat" again
6. Hear "I can only repeat each question once"

## 🚀 DEPLOYMENT CHECKLIST

- [ ] Agent process running with latest code
- [ ] Frontend dev server running with latest code
- [ ] Backend API running
- [ ] Celery worker running
- [ ] All environment variables set correctly
- [ ] LiveKit credentials valid
- [ ] Deepgram API key valid
- [ ] OpenAI API key valid
- [ ] Supabase connection working
- [ ] Test candidate created and ready

## 🔍 DEBUGGING COMMANDS

```bash
# Check agent is running
ps aux | grep "interview.entrypoint" | grep -v grep

# Restart agent
cd backend
pkill -f "app.interview.entrypoint"
source .venv/bin/activate
nohup python -m app.interview.entrypoint dev > agent.log 2>&1 &

# Watch agent logs
tail -f agent.log | grep -E "(INFO|WARNING|ERROR|Timer|question|Advancing)"

# Check frontend
# Terminal should show "compiled successfully"

# Delete test candidate
cd backend
source .venv/bin/activate
python3 -c "
from app.services.supabase import supabase as sb
email = 'team@nunnarilabs.com'
c = sb.table('candidates').select('id').eq('email', email).execute().data
if c:
    cid = c[0]['id']
    apps = sb.table('applications').select('id').eq('candidate_id', cid).execute().data
    for app in apps:
        aid = app['id']
        sessions = sb.table('interview_sessions').select('id').eq('application_id', aid).execute().data
        for s in sessions:
            sid = s['id']
            sb.table('interview_qa').delete().eq('session_id', sid).execute()
            sb.table('interview_reports').delete().eq('session_id', sid).execute()
            sb.table('interview_sessions').delete().eq('id', sid).execute()
        sb.table('resume_data').delete().eq('application_id', aid).execute()
        sb.table('applications').delete().eq('id', aid).execute()
    sb.table('candidates').delete().eq('id', cid).execute()
    print('Deleted')
"
```

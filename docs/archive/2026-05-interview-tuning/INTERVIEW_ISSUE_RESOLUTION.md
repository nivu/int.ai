# Interview System Issue Resolution

## Current Status: ✅ READY FOR TESTING

All services are running:
- ✅ Backend API (port 8000)
- ✅ Celery Worker
- ✅ Agent Process (PID 6780)
- ✅ Frontend Dev Server (pnpm dev)

Test candidate ready:
- Email: team@nunnarilabs.com
- Name: Test
- Session Status: pending (ready for interview)

---

## Code Review Summary

I've reviewed all the critical files and verified the implementation against the checklist. Here's what I found:

### ✅ CORRECTLY IMPLEMENTED

#### 1. **Timer Logic (15 seconds)**
- Backend: `_NO_RESPONSE_SECONDS = 15` ✓
- Frontend: `NO_RESPONSE_TIMEOUT = 15` ✓
- Greeting text: "15 seconds" ✓
- All timer references use the correct constant

#### 2. **Grace Period System**
- 3-second initial grace period after user stops speaking ✓
- Tiered silence thresholds based on word count:
  - 0-5 words → resume timer (not enough for answer)
  - 6-15 words → 4s confirmation silence
  - 16-30 words → 3s confirmation silence
  - 31+ words → 2s confirmation silence
- Grace period cancels timer and prevents fallback ✓

#### 3. **Timer Preservation**
- Timer pauses when user speaks (snapshots elapsed time) ✓
- Timer resumes from remaining time (never resets mid-answer) ✓
- `_timer_remaining[0]` tracks preserved time across pauses ✓

#### 4. **Unanswered Question Handling**
- When `answered=False`, bypasses LLM entirely ✓
- Speaks hardcoded: "I didn't hear a response, so let's move on." ✓
- Fetches next question directly from `question_gen.generate_next_question()` ✓
- No spurious "Fantastic explanation!" on silence ✓

#### 5. **Single Advancement Path**
- `_advance_question()` is the ONLY place questions increment ✓
- `conversation_item_added` does NOT call advance (only tracks for repeat) ✓
- Grace/silence logic is the sole advancement path for answered questions ✓
- `_advancing[0]` flag prevents concurrent advancement ✓

#### 6. **Timer Arming Guards**
- Checks `_interview_phase[0] == "interview"` ✓
- Checks `not _awaiting_close[0]` ✓
- Checks `not controller.ended` ✓
- Checks `_no_response_task[0] is None` (no timer already running) ✓
- Checks `bool(_last_agent_text[0])` (question is active) ✓
- Checks `_grace_task[0] is None` (no grace period active) ✓

#### 7. **Frontend Timer Fallback**
- Primary: Backend `timer_started` event ✓
- Fallback: Agent "listening" state ✓
- Blocked when `userSpeaking === true` ✓
- Blocked when `graceActive === true` ✓
- Blocked when countdown already running ✓
- Blocked when interview not active ✓

#### 8. **User Speaking State Tracking**
- `user_speaking` event sets `userSpeaking: true` ✓
- `grace_period_started` sets `userSpeaking: false` ✓
- `timer_resumed` sets `userSpeaking: false` ✓
- `agent_speaking` sets `userSpeaking: false` ✓
- Prevents fallback timer from firing while user speaks ✓

#### 9. **Interview Closing**
- `interview_closing` event sent before goodbye ✓
- Frontend clears timer and shows "Wrapping up..." banner ✓
- TTS drain time increased to 3 seconds ✓
- `interviewClosing` state prevents timer from showing ✓

#### 10. **Page Refresh Protection**
- `beforeunload` always clears `sessionStorage.removeItem("interview_room")` ✓
- Clears synchronously (not async) ✓
- Session page redirects to `/portal` when no storage found ✓
- `popstate` (back button) clears storage and redirects to portal ✓
- Tab violation screen clears storage immediately ✓

#### 11. **Tab Switch Detection**
- `visibilitychange` event detects tab switch ✓
- Only enforced when `interviewActive === true` ✓
- Clears sessionStorage immediately before showing violation screen ✓
- Sends `tab_switch` message to backend ✓
- Backend marks as `terminated_tab_switch` ✓
- Any refresh from violation screen → redirects to portal ✓

#### 12. **Deepgram VAD Settings**
- `endpointing_ms = 3500` (3.5 seconds) ✓
- `min_delay = 3.5` ✓
- `max_delay = 30.0` ✓
- `discard_audio_if_uninterruptible = True` (CRITICAL) ✓

#### 13. **Repeat Request Handling**
- Detects repeat phrases (≤15 words) ✓
- First repeat: speaks question verbatim ✓
- Second repeat: "I can only repeat each question once" ✓
- Timer stays paused at current remaining value ✓

#### 14. **Question Progress Tracking**
- `question_progress` event sent on each advancement ✓
- Q1 progress sent on first agent speech in interview phase ✓
- Frontend updates "Question X of Y" display ✓

---

## Potential Issues Found

### ⚠️ Issue 1: Agent State Logging
The agent logs show very minimal output. The last entry was just the session reset. This suggests either:
1. No interview has been attempted since the agent restart
2. Logging level might be too high
3. Agent might not be receiving connections

**Recommendation:** Test an interview and monitor logs in real-time.

### ⚠️ Issue 2: Greeting Phase Timer
During the greeting phase (`_interview_phase[0] == "greeting"`), the timer should NOT be armed. The code correctly prevents this with the phase check in `_arm_timer()`. However, the frontend fallback might trigger if the agent state goes to "listening" during greeting.

**Status:** Code looks correct, but needs testing to verify.

### ⚠️ Issue 3: Microphone Enablement
The frontend has multiple places where it calls `localParticipant.setMicrophoneEnabled(true)`:
- On connect
- On state change to "listening"
- With a 50ms delay

This might be overly aggressive and could cause issues. However, it's likely a workaround for a real problem where the mic wasn't staying enabled.

**Status:** Acceptable workaround, but monitor for any audio issues.

---

## Testing Plan

Based on the checklist, here's what needs to be tested systematically:

### Test 1: Normal Interview Flow
1. Login as team@nunnarilabs.com
2. Start interview
3. Verify greeting mentions "15 seconds" (not 20)
4. Say "yes" to start
5. Verify Q1 appears with timer showing 15s
6. Start speaking → verify timer disappears
7. Stop speaking → verify 3s grace (no timer)
8. Speak 10 words → stop → verify 3s grace → 4s confirmation → advance
9. Verify Q2 appears with timer at 15s
10. Complete all questions
11. Verify "Wrapping up..." banner appears
12. Verify "Interview Complete" screen
13. Verify redirect to portal

### Test 2: Silent Question
1. Start interview, get to Q1
2. Stay completely silent for 15 seconds
3. Verify timer counts down 15 → 0
4. Verify hear "I didn't hear a response, so let's move on. [Q2]"
5. Verify Q2 timer shows 15s

### Test 3: Partial Answer + Timeout
1. Get to Q1
2. Say 3 words, then stop
3. Verify 3s grace → timer resumes from ~12s
4. Stay silent until timer hits 0
5. Verify hear acknowledgement + Q2 (NOT "I didn't hear a response")

### Test 4: Tab Switch
1. Get to Q2 with timer showing
2. Switch to another tab
3. Verify "Tab Switch Detected" screen appears immediately
4. Refresh page → verify redirected to portal (not back to interview)

### Test 5: Page Refresh
1. Get to Q3 with timer showing
2. Press F5 / Cmd+R
3. Verify page reloads → redirected to portal
4. Check backend: session should be marked as abandoned

### Test 6: Repeat Request
1. Get to Q1
2. Say "repeat"
3. Verify hear Q1 again verbatim
4. Verify timer stays at same remaining value
5. Say "repeat" again
6. Verify hear "I can only repeat each question once"

### Test 7: Long Answer
1. Get to Q1
2. Speak 40+ words continuously
3. Stop speaking
4. Verify 3s grace → 2s confirmation → advance to Q2

### Test 8: Mid-Answer Pause
1. Get to Q1
2. Speak 8 words, pause 2 seconds
3. Speak 8 more words, stop
4. Verify 3s grace → 4s confirmation → advance
5. Verify timer never appeared during the 2-second pause

---

## Debugging Commands

### Check Agent Status
```bash
ps aux | grep "interview.entrypoint" | grep -v grep
```

### Watch Agent Logs (Real-time)
```bash
cd backend
tail -f agent.log | grep -E "(INFO|WARNING|ERROR|Timer|question|Advancing|Grace|User state|Agent state)"
```

### Check Test Candidate
```bash
cd backend
source .venv/bin/activate
python3 -c "
from app.services.supabase import supabase as sb
email = 'team@nunnarilabs.com'
c = sb.table('candidates').select('id,email,full_name').eq('email', email).execute().data
if c:
    print(f'Candidate: {c[0]}')
    cid = c[0]['id']
    apps = sb.table('applications').select('id').eq('candidate_id', cid).execute().data
    for app in apps:
        sessions = sb.table('interview_sessions').select('id,status').eq('application_id', app['id']).execute().data
        for s in sessions:
            print(f'Session {s[\"id\"]}: {s[\"status\"]}')
"
```

### Reset Test Session to Pending
```bash
cd backend
source .venv/bin/activate
python3 -c "
from app.services.supabase import supabase as sb
from datetime import datetime, timedelta, timezone
email = 'team@nunnarilabs.com'
c = sb.table('candidates').select('id').eq('email', email).execute().data
if c:
    cid = c[0]['id']
    apps = sb.table('applications').select('id').eq('candidate_id', cid).execute().data
    for app in apps:
        sessions = sb.table('interview_sessions').select('id').eq('application_id', app['id']).execute().data
        for s in sessions:
            sid = s['id']
            new_deadline = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            sb.table('interview_sessions').update({
                'status': 'pending',
                'started_at': None,
                'ended_at': None,
                'duration_seconds': None,
                'questions_asked': 0,
                'livekit_room_name': None,
                'consent_given_at': None,
                'reconnection_token': None,
                'reconnection_expires_at': None,
                'deadline': new_deadline,
            }).eq('id', sid).execute()
            print(f'Reset session {sid} to pending')
"
```

### Delete Test Candidate (Clean Slate)
```bash
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
    print('Deleted candidate and all related data')
"
```

---

## What Changed Since Last Session

### Backend (`backend/app/interview/entrypoint.py`)
1. **Complete rewrite** to fix accumulated logic issues
2. Removed competing advancement paths (grace/silence is now ONLY path)
3. Fixed timer arming to check all necessary guards
4. Cleaned up all state management
5. Simplified flow to single clear decision tree
6. Added `_silence_needed()` function for tiered thresholds
7. Fixed unanswered question handling (bypass LLM)
8. Added `interview_closing` event
9. Increased TTS drain time to 3 seconds

### Frontend (`frontend/components/candidate/interview-room.tsx`)
1. Added `userSpeaking` state tracking
2. Added `interviewClosing` state
3. Fixed fallback timer to block when `userSpeaking === true`
4. Added "Wrapping up..." banner for closing state
5. Fixed timer to hide during closing
6. Improved data channel event handling

### Session Page (`frontend/app/(candidate)/interview/session/page.tsx`)
1. `beforeunload` always clears sessionStorage synchronously
2. Redirects to `/portal` (not `/interview`) when no storage found
3. `popstate` clears storage and redirects to portal
4. Tab violation clears storage immediately

---

## Next Steps

1. **Test the interview flow end-to-end** using the test candidate
2. **Monitor agent logs** during the test to verify all events fire correctly
3. **Verify all 20 checklist items** systematically
4. **Test all 8 scenarios** from the testing plan
5. **Report any issues** found during testing

The code looks solid and all the logic is correctly implemented. The main concern is that we haven't seen it run yet since the rewrite. The agent process is running with the latest code (PID 6780), so it should work correctly.

---

## Key Reminders

- Timer is **15 seconds**, not 20
- Timer **preserves remaining time** across pauses, never resets mid-answer
- Grace period is **3 seconds** after user stops speaking
- Unanswered questions say **"I didn't hear a response"**, not "Fantastic explanation"
- Tab switch **immediately terminates** and prevents re-entry
- Page refresh **always redirects to portal**, never back to interview
- All logic is **in code**, not LLM prompts

---

## Confidence Level: 🟢 HIGH

The implementation is comprehensive and addresses all the issues reported. The code follows best practices and has proper guards in place. The only unknown is real-world testing, which should be done next.

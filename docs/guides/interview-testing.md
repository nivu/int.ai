# Interview System Testing Guide

## Quick Status Check

### ✅ All Systems Running
```bash
# Check all services
ps aux | grep -E "(uvicorn|celery|interview.entrypoint|pnpm)" | grep -v grep
```

Expected output:
- Backend API (uvicorn on port 8000)
- Celery Worker
- Agent Process (interview.entrypoint)
- Frontend (pnpm dev)

### ✅ Agent Running Latest Code
- File modified: 2026-05-08 09:27:04
- Process started: 2026-05-08 10:01:00
- **Status: Agent is running the latest code** ✓

### ✅ Test Candidate Ready
- Email: team@nunnarilabs.com
- Password: (use your test password)
- Session Status: pending

---

## Quick Test (5 minutes)

This is a fast sanity check to verify the core functionality works:

1. **Login**
   - Go to http://localhost:3000
   - Login as team@nunnarilabs.com
   - Navigate to interview

2. **Greeting Phase**
   - ✓ Hear greeting with rules
   - ✓ Greeting says "15 seconds" (not 20)
   - ✓ No timer visible during greeting
   - Say "yes" to start

3. **First Question**
   - ✓ Q1 asked
   - ✓ Timer shows 15 seconds
   - ✓ "Question 1 of X" displayed

4. **Timer Behavior**
   - Start speaking → ✓ Timer disappears
   - Stop speaking → ✓ 3s grace (no timer)
   - Wait → ✓ Timer resumes from remaining time

5. **Answer & Advance**
   - Speak 10+ words
   - Stop speaking
   - ✓ 3s grace → 4s confirmation → advance to Q2
   - ✓ Q2 timer shows 15s (not remaining from Q1)

6. **Tab Switch**
   - Switch to another tab
   - ✓ "Tab Switch Detected" screen appears
   - ✓ Refresh page → redirected to portal

**If all ✓ pass: System is working correctly!**

---

## Comprehensive Test (20 minutes)

### Test 1: Normal Flow
**Goal:** Verify complete interview works end-to-end

1. Login and start interview
2. Listen to greeting (verify "15 seconds" mentioned)
3. Say "yes" to start
4. For each question:
   - Verify timer shows 15s when question asked
   - Start speaking → verify timer disappears
   - Stop speaking → verify 3s grace period (no timer)
   - Continue speaking → verify timer stays hidden
   - Stop speaking → verify grace → confirmation → advance
5. Complete all questions
6. Verify "Wrapping up..." banner appears
7. Verify "Interview Complete" screen
8. Verify redirect to portal

**Expected:** Smooth flow, no premature advancement, timer behaves correctly

---

### Test 2: Silent Question
**Goal:** Verify unanswered question handling

1. Start interview, get to Q1
2. Stay completely silent for 15 seconds
3. Watch timer count down 15 → 0
4. Listen to response

**Expected:**
- ✓ Hear "I didn't hear a response, so let's move on. [Q2]"
- ✗ Should NOT hear "Fantastic explanation" or any acknowledgement
- ✓ Q2 timer shows 15s

---

### Test 3: Partial Answer + Timeout
**Goal:** Verify timer resumes correctly after short answer

1. Get to Q1
2. Say exactly 3 words: "I think that"
3. Stop speaking
4. Wait for grace period (3s)
5. Watch timer resume
6. Stay silent until timer hits 0

**Expected:**
- ✓ Timer resumes from ~12s (not reset to 15s)
- ✓ Hear acknowledgement + Q2 (NOT "I didn't hear a response")
- ✓ System treats it as answered (even though short)

---

### Test 4: Tab Switch
**Goal:** Verify tab switch detection and prevention

1. Get to Q2 with timer showing
2. Switch to another tab (Cmd+Tab or click another tab)
3. Observe violation screen
4. Press F5 to refresh

**Expected:**
- ✓ "Tab Switch Detected" screen appears immediately
- ✓ Red warning icon shown
- ✓ Refresh redirects to portal (not back to interview)
- ✓ Cannot re-enter interview

---

### Test 5: Page Refresh
**Goal:** Verify refresh protection

1. Get to Q3 with timer showing
2. Press F5 / Cmd+R

**Expected:**
- ✓ Page reloads
- ✓ Redirected to portal (not back to interview)
- ✓ Session marked as abandoned in backend

---

### Test 6: Repeat Request
**Goal:** Verify repeat functionality and limits

1. Get to Q1
2. Say "repeat" or "can you repeat that"
3. Listen to response
4. Say "repeat" again
5. Listen to response

**Expected:**
- ✓ First repeat: hear Q1 again verbatim
- ✓ Timer stays at same remaining value (doesn't reset)
- ✓ Second repeat: hear "I can only repeat each question once"
- ✓ Timer still stays at same value

---

### Test 7: Long Answer
**Goal:** Verify tiered silence thresholds

1. Get to Q1
2. Speak 40+ words continuously (e.g., describe your experience in detail)
3. Stop speaking
4. Wait silently

**Expected:**
- ✓ 3s grace period
- ✓ 2s confirmation silence (31+ words tier)
- ✓ Total ~5s wait before advancing
- ✓ Advance to Q2

---

### Test 8: Mid-Answer Pause
**Goal:** Verify timer doesn't appear during natural pauses

1. Get to Q1
2. Speak 8 words
3. Pause for 2 seconds (thinking pause)
4. Speak 8 more words
5. Stop speaking

**Expected:**
- ✓ Timer never appears during the 2-second pause
- ✓ 3s grace after final stop
- ✓ 4s confirmation silence (6-15 words tier)
- ✓ Advance to Q2

---

## Monitoring During Tests

### Terminal 1: Agent Logs
```bash
cd backend
tail -f agent.log | grep -E "(INFO|WARNING|ERROR|Timer|question|Advancing|Grace|User state|Agent state)"
```

Watch for:
- "Timer armed" when questions start
- "Timer paused" when user speaks
- "Grace started" when user stops speaking
- "Advancing Q#X" when moving to next question
- "User state speaking→listening" transitions

### Terminal 2: Frontend Logs
The Next.js dev server terminal shows:
- Component re-renders
- Data channel messages received
- State changes

Watch for:
- "[interview] data received:" messages
- "[interview] timer_started" events
- "[interview] grace_period_started" events

---

## Common Issues & Solutions

### Issue: Timer not appearing
**Symptoms:** Question asked, but no countdown ring shows

**Check:**
1. Agent logs: Is "Timer armed" message present?
2. Frontend logs: Is "timer_started" event received?
3. Browser console: Any errors?

**Solution:**
- Verify agent is in "listening" state
- Verify `_last_agent_text[0]` is set (question is active)
- Check frontend `interviewActive` state is true

---

### Issue: Timer counts while speaking
**Symptoms:** Countdown continues even when candidate is talking

**Check:**
1. Frontend logs: Is "user_speaking" event received?
2. Browser console: Is `userSpeaking` state set to true?

**Solution:**
- Verify Deepgram is detecting speech
- Check microphone permissions
- Verify `discard_audio_if_uninterruptible` is true in agent.py

---

### Issue: Premature advancement
**Symptoms:** Interview moves to next question while candidate is still speaking

**Check:**
1. Agent logs: When does "Advancing" message appear?
2. Check word count in logs
3. Verify grace period duration

**Solution:**
- Should only advance after grace + confirmation silence
- Verify `_grace_task` is not being cancelled prematurely
- Check `_user_state[0]` is "listening" before advancing

---

### Issue: "Fantastic explanation" on silence
**Symptoms:** Agent acknowledges answer when candidate said nothing

**Check:**
1. Agent logs: Is `answered=False` passed to `_advance_question()`?
2. Check word count: should be 0 for completely silent

**Solution:**
- Verify `_get_word_count()` returns 0
- Verify `_advance_question(answered=False)` bypasses LLM
- Check "I didn't hear a response" is spoken

---

### Issue: Can re-enter after tab switch
**Symptoms:** Refresh from violation screen goes back to interview

**Check:**
1. Browser console: Is sessionStorage cleared?
2. Session page: Does it redirect to portal?

**Solution:**
- Verify `sessionStorage.removeItem("interview_room")` is called
- Verify session page checks for storage and redirects
- Check `beforeunload` handler is registered

---

## Reset Commands

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
            sb.table('interview_qa').delete().eq('session_id', sid).execute()
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

### Restart Agent (if needed)
```bash
cd backend
pkill -f "app.interview.entrypoint"
source .venv/bin/activate
nohup python -m app.interview.entrypoint dev > agent.log 2>&1 &
echo "Agent restarted, PID: $(pgrep -f 'app.interview.entrypoint')"
```

---

## Success Criteria

The system is working correctly if:

1. ✅ Timer shows 15 seconds (not 20)
2. ✅ Timer disappears when candidate speaks
3. ✅ Timer stays hidden during grace period
4. ✅ Timer resumes from remaining time (not reset)
5. ✅ Interview advances only after grace + confirmation silence
6. ✅ Unanswered questions say "I didn't hear a response"
7. ✅ Tab switch terminates and prevents re-entry
8. ✅ Page refresh redirects to portal
9. ✅ Repeat works once per question
10. ✅ Last question closes smoothly with "Wrapping up..." banner

---

## Next Steps After Testing

1. **If all tests pass:** System is ready for production
2. **If issues found:** Document them and create fixes
3. **Performance testing:** Test with multiple concurrent interviews
4. **Edge cases:** Test network interruptions, audio issues, etc.

---

## Contact

If you encounter issues during testing:
1. Check agent logs first
2. Check frontend console
3. Verify all services are running
4. Try resetting the test session
5. Document the exact steps to reproduce

Good luck with testing! 🚀

# Testing the Interview Pause Fix

## Prerequisites

Both servers are currently running:
- ✅ Frontend: http://localhost:3000
- ✅ Backend API: http://0.0.0.0:8000

## Starting the LiveKit Interview Worker

The interview agent changes require the LiveKit worker to be running. To start it:

```bash
cd backend
source .venv/bin/activate
python -m app.interview.entrypoint
```

Or if there's a specific worker start script:
```bash
cd backend
./start_worker_with_autorestart.sh
```

## Test Scenarios

### Scenario 1: Natural Mid-Answer Pause (2-3 seconds)
**Expected:** System should wait, not interrupt

1. Start an interview session
2. Begin answering a question
3. Pause for 2-3 seconds mid-sentence
4. Continue your answer

**✅ Success Criteria:**
- No "thinking" indicator appears during pause
- Answer continues seamlessly
- No question advancement
- Audio and text stay synchronized

### Scenario 2: Long Pause (6+ seconds)
**Expected:** System finalizes turn after 6 seconds

1. Start answering a question
2. Pause for 6+ seconds
3. Observe system behavior

**✅ Success Criteria:**
- System waits full 6 seconds before any action
- After 6 seconds, turn is finalized
- System processes the answer and moves to next question
- Transition is smooth with proper acknowledgment

### Scenario 3: Multiple Pauses in One Answer
**Expected:** All pauses tolerated as long as each is < 6 seconds

1. Answer a question with multiple 2-3 second pauses
2. Example: "I think... [pause 3s] ...the best approach is... [pause 2s] ...to use microservices"

**✅ Success Criteria:**
- Each pause resets the 6-second timer
- Answer is captured as one complete response
- No premature finalization

### Scenario 4: Filler Words Only
**Expected:** 10-second grace period

1. Say only "um... uh... hmm"
2. Wait and observe

**✅ Success Criteria:**
- System gives 10 seconds to provide real answer
- If no real answer, question is skipped
- Message: "I didn't hear a response, so let's move on"

### Scenario 5: Complete Silence (15 seconds)
**Expected:** Question skipped after 15 seconds

1. Agent asks question
2. Remain completely silent for 15 seconds

**✅ Success Criteria:**
- Countdown shows on UI
- After 15 seconds: "I didn't hear a response, so let's move on to the next question"
- Moves to next question
- Question recorded with blank answer

### Scenario 6: Resume After Pause
**Expected:** Silence timer resets when speech resumes

1. Start answering
2. Pause for 5 seconds (just under 6)
3. Resume speaking

**✅ Success Criteria:**
- Timer resets when you resume
- Answer continues normally
- No interruption or finalization

## Monitoring Logs

Watch the backend logs for these key indicators:

```bash
# In the worker terminal, look for:
"Final transcript segment captured"  # Speech detected
"User state changed old=listening new=speaking"  # User started speaking
"User state changed old=speaking new=listening"  # User stopped (silence begins)
"Q&A #N/M"  # Answer recorded after 6s silence
```

## Configuration Verification

To verify the changes are active, check the logs when the worker starts:

```python
# Should see in agent.py initialization:
endpointing_ms=6000  # Deepgram STT
min_delay: 6.0       # VAD turn finalization
max_delay: 10.0      # VAD max speech duration
```

## Rollback (if needed)

If the 6-second delay is too long, you can adjust in `backend/app/interview/agent.py`:

```python
# Reduce to 4 seconds:
endpointing_ms=4000
min_delay: 4.0
max_delay: 8.0
```

Then restart the worker.

## Common Issues

### Issue: Changes not taking effect
**Solution:** Restart the LiveKit worker process (not just the API server)

### Issue: Still getting premature interruptions
**Solution:** Check that both `endpointing_ms` AND `min_delay` are set to 6000/6.0

### Issue: Answers getting cut off mid-sentence
**Solution:** Increase `max_delay` to allow longer continuous speech

### Issue: Too much lag between answer and next question
**Solution:** This is expected with 6s threshold. Can reduce to 4-5s if needed.

## Success Metrics

After testing, the interview experience should feel:
- ✅ Natural and conversational
- ✅ No awkward interruptions during thinking pauses
- ✅ Smooth transitions between questions
- ✅ Audio and text perfectly synchronized
- ✅ Clear feedback when silence threshold is reached

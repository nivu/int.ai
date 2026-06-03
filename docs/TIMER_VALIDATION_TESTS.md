# Timer Logic Validation Tests

## Overview
Automated tests that validate the timer freeze/resume logic runs on every server startup to ensure the critical bug where timers don't resume after candidate pauses never happens again.

## Test Location
- **Test File:** `backend/app/interview/test_timer_logic.py`
- **Integration:** `backend/app/main.py` (runs during FastAPI lifespan startup)

## What Gets Tested

### 1. Logic Tests (`test_timer_freeze_resume_logic`)
Simulates the complete interview timer flow:

#### Test 1: Initial Timer Start
- ✅ Verifies `timer_started` event is sent when question is asked
- ✅ Verifies `timer_resumed` is NOT sent initially

#### Test 2: User Speaks
- ✅ Verifies `user_speaking` event is sent when candidate starts speaking

#### Test 3: Grace Period
- ✅ Verifies `grace_period_started` event is sent after candidate stops speaking

#### Test 4: Timer Resume (Critical Bug Fix)
- ✅ Verifies `timer_resumed` event is sent (NOT `timer_started`)
- ✅ Verifies only one event type is sent (no duplicates)

#### Test 5: Complete Flow Sequence
- ✅ Verifies events are sent in correct order:
  1. `timer_started`
  2. `user_speaking`
  3. `grace_period_started`
  4. `timer_resumed`

#### Test 6: Multiple Speak/Pause Cycles
- ✅ Verifies timer can freeze and resume multiple times
- ✅ Verifies event types remain correct across cycles

#### Test 7: Event Data Validation
- ✅ Verifies `timer_resumed` includes `remaining` time field

### 2. Static Analysis Tests (`test_arm_timer_function_signature`)
Validates the actual implementation code:

- ✅ Verifies `_arm_timer()` has `event_type` parameter
- ✅ Verifies default value is `"timer_started"`
- ✅ Verifies `_arm_timer("timer_resumed")` is called for resume logic
- ✅ Verifies function uses `event_type` parameter (not hardcoded)

## Running Tests

### Automatic (On Server Startup)
Tests run automatically when the FastAPI server starts:

```bash
cd backend
uvicorn app.main:app --reload
```

Output will show:
```
INFO - Running timer logic validation tests...
INFO - ╔══════════════════════════════════════════════════════════════════════════════╗
INFO - ║                    TIMER LOGIC VALIDATION SUITE                              ║
INFO - ╚══════════════════════════════════════════════════════════════════════════════╝
...
INFO - ✅ ALL TESTS PASSED
INFO - ✅ Timer logic validation PASSED
```

### Manual Testing
Run tests independently:

```bash
cd backend
python app/interview/test_timer_logic.py
```

Or as a module:

```bash
cd backend
python -m app.interview.test_timer_logic
```

## Test Results

### Success Output
```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         🎉 ALL TESTS PASSED 🎉                                ║
║                                                                              ║
║  Timer freeze/resume bug is FIXED and validated                             ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Failure Output
```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         ❌ TESTS FAILED ❌                                     ║
║                                                                              ║
║  Timer freeze/resume logic has issues - review errors above                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

Errors found:
  ❌ FAILED: Timer resume sends 'timer_resumed' not 'timer_started' - Expected 'timer_resumed' event not sent
  ❌ FAILED: _arm_timer not called with 'timer_resumed' parameter
```

## What the Tests Prevent

### The Original Bug
**Problem:** After candidate speaks and pauses, timer doesn't resume - interview waits indefinitely.

**Root Cause:** `_arm_timer()` always sent `"timer_started"` event, even when resuming. Frontend only listened for `"timer_resumed"` for resume logic.

**Prevention:** Tests verify:
1. `_arm_timer()` accepts `event_type` parameter
2. Resume logic calls `_arm_timer("timer_resumed")`
3. Correct event is sent to frontend
4. No duplicate/conflicting events

### Future Regressions
If someone accidentally:
- Removes the `event_type` parameter from `_arm_timer()`
- Changes resume logic to send wrong event
- Hardcodes `"timer_started"` instead of using parameter
- Breaks the event sequence

**The tests will FAIL on server startup** and alert developers immediately.

## Integration with CI/CD

### Recommended Setup
Add to your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run Timer Logic Tests
  run: |
    cd backend
    python app/interview/test_timer_logic.py
  
- name: Fail if tests don't pass
  if: failure()
  run: exit 1
```

### Pre-commit Hook
Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
cd backend
python app/interview/test_timer_logic.py
if [ $? -ne 0 ]; then
    echo "Timer logic tests failed - commit aborted"
    exit 1
fi
```

## Maintenance

### Adding New Tests
To add new timer-related tests:

1. Add test function to `test_timer_logic.py`
2. Call it from `run_all_timer_tests()`
3. Follow the pattern:
   ```python
   async def test_new_feature() -> bool:
       test = TimerLogicTest()
       # ... test logic ...
       return test.test_passed
   ```

### Updating for New Features
If timer behavior changes:

1. Update tests to match new expected behavior
2. Update this documentation
3. Ensure tests still validate the core freeze/resume logic

## Related Files

- **Implementation:** `backend/app/interview/entrypoint.py` (timer logic)
- **Frontend:** `frontend/components/candidate/interview-room.tsx` (timer UI)
- **Spec:** `specs/001-hiring-automation-platform/spec.md` (requirements)
- **Bug Fix:** `docs/TIMER_FREEZE_BUG_FIX.md` (original fix documentation)

## Exit Codes

- **0:** All tests passed
- **1:** One or more tests failed

## Troubleshooting

### Tests Fail on Startup
1. Check the error messages in the output
2. Review `backend/app/interview/entrypoint.py` for changes
3. Verify `_arm_timer()` function signature
4. Check that resume logic calls `_arm_timer("timer_resumed")`

### Tests Don't Run
1. Verify `app/interview/test_timer_logic.py` exists
2. Check import in `app/main.py`
3. Ensure logging is configured correctly

### False Positives
If tests pass but timer still doesn't work:
1. Check frontend event handlers in `interview-room.tsx`
2. Verify LiveKit data channel is working
3. Check browser console for frontend errors
4. Review backend logs for event publishing

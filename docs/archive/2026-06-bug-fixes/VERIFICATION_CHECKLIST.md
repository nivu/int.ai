# Bug Fixes Verification Checklist

Use this checklist to verify all 10 bug fixes are working correctly before deploying to production.

## Pre-Deployment Verification

### Bug 1: LLM Response Latency ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug1_llm_request_queuing -v`
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug1_llm_fallback_on_timeout -v`

**Integration Tests**:
- [ ] Start 10 concurrent interviews
- [ ] Verify LLM responses within 2 seconds
- [ ] Check logs for "LLM request queued" messages
- [ ] Verify fallback questions used when timeout occurs

**Success Criteria**:
- [ ] 95%+ responses within 2 seconds
- [ ] No interview failures due to LLM timeout
- [ ] Queue size stays <20 under normal load

---

### Bug 2: VAD False Positives ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug2_vad_duration_filtering -v`

**Integration Tests**:
- [ ] Start interview
- [ ] Make short noise (<200ms) - snap fingers, cough briefly
- [ ] Verify timer does NOT freeze
- [ ] Speak normally (>200ms)
- [ ] Verify timer DOES freeze

**Success Criteria**:
- [ ] Short noises (<200ms) ignored
- [ ] Normal speech (>200ms) detected correctly
- [ ] False positive rate <5%

**Logs to Check**:
```bash
grep "Ignoring short speech event" backend/agent.log
```

---

### Bug 3: STT Latency & Word Count ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug3_word_count_calculation -v`

**Integration Tests**:
- [ ] Start interview
- [ ] Answer with exactly 10 words
- [ ] Verify 4-second confirmation silence (6-15 word tier)
- [ ] Answer with exactly 25 words
- [ ] Verify 3-second confirmation silence (16-30 word tier)
- [ ] Answer with 40 words
- [ ] Verify 2-second confirmation silence (31+ word tier)

**Success Criteria**:
- [ ] Word counts accurate (±1 word)
- [ ] Correct silence duration for each tier
- [ ] No premature advancement

---

### Bug 4: TTS Audio End Detection ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug4_tts_configuration -v`

**Integration Tests**:
- [ ] Start interview
- [ ] Observe first question
- [ ] Verify timer starts ONLY after audio finishes playing
- [ ] Check that timer doesn't start during audio playback

**Success Criteria**:
- [ ] Timer never starts before audio ends
- [ ] No audio cutoff or overlap
- [ ] Consistent behavior across all questions

---

### Bug 5: Tab Switch Detection ✓

**Safari Desktop**:
- [ ] Start interview on Safari
- [ ] Switch to another tab
- [ ] Verify session terminates within 2 seconds
- [ ] Verify "Tab Switch Detected" screen shown
- [ ] Verify cannot re-enter interview

**iOS Safari**:
- [ ] Start interview on iPhone Safari
- [ ] Switch to another app
- [ ] Verify session terminates within 2 seconds
- [ ] Return to browser
- [ ] Verify "Tab Switch Detected" screen shown

**Chrome Mobile**:
- [ ] Start interview on Chrome mobile
- [ ] Switch to another app
- [ ] Verify session terminates within 2 seconds
- [ ] Return to browser
- [ ] Verify "Tab Switch Detected" screen shown

**Success Criteria**:
- [ ] 100% detection rate on Safari desktop
- [ ] 100% detection rate on iOS Safari
- [ ] 100% detection rate on Chrome mobile
- [ ] Termination within 2 seconds
- [ ] No false positives (switching within same browser)

---

### Bug 6: Force-Quit Session Cleanup ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug6_server_side_session_validation -v`

**Integration Tests**:
- [ ] Start interview
- [ ] Force-quit browser (kill process)
- [ ] Reopen browser
- [ ] Try to access interview URL directly
- [ ] Verify redirect to portal (no re-entry)
- [ ] Verify session status is "completed" or "terminated" in database

**Success Criteria**:
- [ ] No re-entry after force-quit
- [ ] Server-side validation prevents access
- [ ] Session status correctly updated

**Database Check**:
```sql
SELECT status FROM interview_sessions WHERE id = '<session_id>';
-- Should be 'completed' or 'terminated_*', NOT 'in_progress'
```

---

### Bug 7: Redis Persistence ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug7_redis_persistence_config -v`

**Configuration Verification**:
```bash
# Check AOF enabled
redis-cli CONFIG GET appendonly
# Expected: 1) "appendonly" 2) "yes"

# Check fsync policy
redis-cli CONFIG GET appendfsync
# Expected: 1) "appendfsync" 2) "everysec"

# Check RDB save points
redis-cli CONFIG GET save
# Expected: "900 1 300 10 60 10000"
```

**Integration Tests**:
- [ ] Start interview
- [ ] Note session ID and current question number
- [ ] Kill Redis: `redis-cli SHUTDOWN NOSAVE`
- [ ] Restart Redis: `redis-server backend/redis.conf`
- [ ] Verify session state restored
- [ ] Candidate reconnects within 5 minutes
- [ ] Interview resumes from correct question

**Success Criteria**:
- [ ] Session state survives Redis crash
- [ ] 5-minute reconnection window works
- [ ] No data loss

**Persistence Info**:
```bash
redis-cli INFO persistence
# Check: aof_enabled:1, rdb_last_save_time
```

---

### Bug 8: Event Ordering ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug8_event_sequence_numbers -v`
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug8_event_reordering -v`

**Integration Tests**:
- [ ] Start interview
- [ ] Open browser console
- [ ] Observe event logs
- [ ] Verify all events have `seq` field
- [ ] Verify sequence numbers increment: 1, 2, 3, 4, ...
- [ ] Simulate network delay (Chrome DevTools → Network → Slow 3G)
- [ ] Verify events still processed in correct order

**Success Criteria**:
- [ ] All events have sequence numbers
- [ ] No sequence gaps
- [ ] Events processed in order even with network delay
- [ ] No state desynchronization

**Console Check**:
```javascript
// Should see in console:
[interview] data received: {type: "timer_started", seq: 1, remaining: 15}
[interview] data received: {type: "user_speaking", seq: 2}
[interview] data received: {type: "grace_period_started", seq: 3, duration: 3}
```

---

### Bug 9: Timer Drift ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug9_high_resolution_timer -v`

**Integration Tests**:
- [ ] Start interview
- [ ] Let interview run for 45 minutes
- [ ] Track timer start/end times in logs
- [ ] Calculate cumulative drift
- [ ] Verify drift <100ms total

**Success Criteria**:
- [ ] Cumulative drift <100ms over 45 minutes
- [ ] Individual timer cycles accurate within ±10ms
- [ ] No noticeable timing issues

**Log Analysis**:
```bash
# Extract timer events
grep "Timer armed" backend/agent.log > timer_events.txt

# Calculate drift (manual analysis of timestamps)
```

---

### Bug 10: Rate Limiting ✓

**Unit Tests**:
- [ ] `pytest backend/tests/test_bug_fixes.py::test_bug10_rate_limit_handling -v`

**Load Tests**:
- [ ] Start 50 concurrent interviews
- [ ] Verify all interviews complete successfully
- [ ] Check logs for rate limit warnings
- [ ] Verify queue size stays manageable
- [ ] Verify fallback questions used when needed

**Success Criteria**:
- [ ] 50 concurrent interviews supported
- [ ] 90%+ completion rate
- [ ] No 429 errors from OpenAI
- [ ] Queue size <30 under peak load

**Monitoring**:
```bash
# Check queue size
grep "LLM request queued" backend/agent.log | grep "queue_size" | tail -20

# Check rate limit warnings
grep "Rate limit reached" backend/agent.log

# Check fallback usage
grep "Using fallback question" backend/agent.log
```

---

## Post-Deployment Monitoring

### First 24 Hours

**Metrics to Track**:
- [ ] Interview completion rate (target: >90%)
- [ ] LLM response latency (target: <2s for 95%)
- [ ] VAD false positive rate (target: <5%)
- [ ] Timer drift (target: <100ms over 45min)
- [ ] Tab switch detection rate (target: 100%)
- [ ] Redis persistence health (no data loss)
- [ ] Event ordering (no gaps in sequence)

**Alerts to Configure**:
- [ ] LLM queue size >20
- [ ] Interview completion rate <85%
- [ ] Redis AOF rewrite failures
- [ ] Event sequence gaps detected
- [ ] Timer drift >200ms

### First Week

**Weekly Review**:
- [ ] Analyze interview completion rates
- [ ] Review LLM fallback usage
- [ ] Check Redis persistence logs
- [ ] Verify no session re-entry incidents
- [ ] Analyze tab switch detection accuracy
- [ ] Review timer accuracy across all interviews

---

## Rollback Triggers

Rollback immediately if:
- [ ] Interview completion rate drops below 80%
- [ ] LLM response latency exceeds 5s for >20% of requests
- [ ] Redis data loss incidents occur
- [ ] Tab switch detection fails on any browser
- [ ] Timer drift exceeds 500ms
- [ ] Event ordering causes state desynchronization

---

## Sign-Off

### Development Team
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code review completed
- [ ] Documentation reviewed

**Signed**: _________________ Date: _________

### QA Team
- [ ] All manual tests completed
- [ ] All browsers tested
- [ ] Load testing completed
- [ ] Performance benchmarks met

**Signed**: _________________ Date: _________

### DevOps Team
- [ ] Redis persistence configured
- [ ] Monitoring alerts configured
- [ ] Rollback plan tested
- [ ] Deployment runbook reviewed

**Signed**: _________________ Date: _________

### Product Team
- [ ] Success criteria validated
- [ ] User experience verified
- [ ] Performance acceptable
- [ ] Ready for production

**Signed**: _________________ Date: _________

---

## Final Checklist

Before deploying to production:
- [ ] All tests passing
- [ ] All sign-offs complete
- [ ] Rollback plan ready
- [ ] Monitoring configured
- [ ] Documentation complete
- [ ] Team notified of deployment
- [ ] Maintenance window scheduled
- [ ] Backup taken

**Deployment Approved**: ☐ Yes ☐ No

**Deployment Date**: _________________

**Deployed By**: _________________

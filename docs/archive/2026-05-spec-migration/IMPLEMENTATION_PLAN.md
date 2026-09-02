# Implementation Plan for Spec Compliance

## Overview

This document outlines the step-by-step plan to bring the interview system to 100% compliance with the specification. Changes are ordered by priority and impact.

---

## Phase 1: Critical Fixes (Must Have)

### 1.1 TTS Gating for STT ❌ CRITICAL

**Problem**: Transcripts can be captured while the AI is speaking, causing "TTS bleed" where the microphone picks up the speaker audio.

**Solution**: Gate the STT stream while TTS is active.

**Implementation**:

```python
# backend/app/interview/entrypoint.py

# Add to state variables (around line 150)
_tts_active: list[bool] = [False]

# Modify _on_agent_state_changed (around line 400)
@session.on("agent_state_changed")
def _on_agent_state_changed(event: AgentStateChangedEvent) -> None:
    _agent_state[0] = event.new_state

    if event.new_state == "speaking":
        _tts_active[0] = True  # ← ADD THIS
        _cancel_no_response_task("agent_speaking")
        # ... rest of existing code

    elif event.new_state == "listening":
        _tts_active[0] = False  # ← ADD THIS
        # ... rest of existing code

# Modify _on_user_input_transcribed (around line 500)
@session.on("user_input_transcribed")
def _on_user_input_transcribed(event: UserInputTranscribedEvent) -> None:
    # ADD THIS CHECK AT THE START
    if _tts_active[0]:
        logger.debug(
            "Discarding transcript during TTS: %r session=%s",
            event.transcript[:50] if event.transcript else "", session_id
        )
        return
    
    # Existing code continues...
    if event.is_final and event.transcript and event.transcript.strip():
        _current_answer_parts[0].append(event.transcript.strip())
```

**Testing**:
1. Start an interview
2. Speak while the AI is speaking
3. Verify those transcripts are discarded (check logs)
4. Verify only transcripts after AI finishes are captured

**Estimated Time**: 1 hour

---

### 1.2 Page Refresh and Navigation Protection ❌ CRITICAL

**Problem**: Candidates can refresh the page or use the back button during an interview, potentially retaking questions.

**Solution**: Detect and prevent all forms of navigation once the interview starts.

**Implementation**:

**Step 1: Backend - Add Session Status Endpoints**

```python
# backend/app/api/interview.py

@router.get("/session-status/{session_id}")
async def get_session_status(session_id: str) -> dict:
    """Check if a session is valid for entry/resume."""
    from app.services.supabase import supabase as sb
    
    session = sb.table("interview_sessions").select("status").eq("id", session_id).single().execute().data
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    status = session.get("status", "")
    
    # Valid states for entering interview
    if status in ["pending", "not_started"]:
        return {"status": status, "can_enter": True}
    
    # Invalid states - redirect to pipeline
    return {"status": status, "can_enter": False}


@router.post("/abandon-session")
async def abandon_session(session_id: str = Body(..., embed=True)) -> dict:
    """Mark a session as abandoned (called via beacon on page unload)."""
    from app.services.supabase import supabase as sb
    
    try:
        sb.table("interview_sessions").update({
            "status": "terminated_abandoned"
        }).eq("id", session_id).eq("status", "in_progress").execute()
        
        return {"status": "ok"}
    except Exception as e:
        logger.exception("Failed to mark session as abandoned: %s", session_id)
        raise HTTPException(status_code=500, detail="Failed to abandon session")
```

**Step 2: Frontend - Add Navigation Protection**

```typescript
// frontend/components/candidate/interview-room.tsx

// Add to InterviewRoomInner component (around line 50)
useEffect(() => {
  // Prevent page refresh and navigation during active interview
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (interviewActiveRef.current && !sessionEndedRef.current) {
      // Send beacon to mark session as abandoned
      const data = JSON.stringify({ session_id: sessionId });
      navigator.sendBeacon('/api/interview/abandon-session', data);
      
      // Show browser confirmation dialog
      e.preventDefault();
      e.returnValue = '';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [sessionId]);

// Prevent back button navigation
useEffect(() => {
  if (interviewActiveRef.current && !sessionEndedRef.current) {
    // Push a dummy state so back button doesn't leave the page
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = () => {
      if (interviewActiveRef.current && !sessionEndedRef.current) {
        // Push state again to prevent navigation
        window.history.pushState(null, '', window.location.href);
        
        // Optionally show a warning
        alert('Please use the "End Interview" button to exit.');
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }
}, []);
```

**Step 3: Frontend - Add Session Status Check on Page Load**

```typescript
// frontend/app/candidate/interview/page.tsx

export default function InterviewPage() {
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const router = useRouter();
  
  useEffect(() => {
    // Check session status before rendering interview
    async function checkSession() {
      try {
        const response = await fetch(`/api/interview/session-status/${sessionId}`);
        const data = await response.json();
        
        if (!data.can_enter) {
          // Session is not valid - redirect to pipeline
          router.push('/candidate/pipeline');
        } else {
          setSessionStatus('valid');
        }
      } catch (error) {
        console.error('Failed to check session status:', error);
        router.push('/candidate/pipeline');
      }
    }
    
    checkSession();
  }, [sessionId, router]);
  
  if (sessionStatus === 'loading') {
    return <div>Loading...</div>;
  }
  
  if (sessionStatus === 'invalid') {
    return null; // Will redirect
  }
  
  // Render interview normally
  return <InterviewRoom ... />;
}
```

**Step 4: Backend - Mark Session as In Progress**

```python
# backend/app/interview/entrypoint.py

# In the greeting phase transition (around line 560)
if _interview_phase[0] == "greeting":
    _cancel_no_response_task()
    _interview_phase[0] = "interview"
    _last_agent_text[0] = ""
    
    # ADD THIS: Mark session as in_progress
    try:
        update_record("interview_sessions", session_id, {"status": "in_progress"})
        logger.info("Session marked in_progress session=%s", session_id)
    except Exception:
        logger.exception("Failed to mark session in_progress session=%s", session_id)
    
    logger.info("Transitioned to interview phase session=%s", session_id)
    # ... rest of existing code
```

**Testing**:
1. Start an interview
2. Try to refresh the page → Should show browser warning
3. Confirm refresh → Should redirect to pipeline
4. Try back button → Should stay on interview page with warning
5. Complete interview normally → Should work as before

**Estimated Time**: 3 hours

---

## Phase 2: Important Improvements

### 2.1 Background Noise Guard ⚠️ IMPROVEMENT

**Problem**: Low-confidence or very short transcripts might trigger speech detection.

**Solution**: Add explicit filtering.

**Implementation**:

```python
# backend/app/interview/entrypoint.py

@session.on("user_input_transcribed")
def _on_user_input_transcribed(event: UserInputTranscribedEvent) -> None:
    # TTS gating (from Phase 1)
    if _tts_active[0]:
        logger.debug("Discarding transcript during TTS session=%s", session_id)
        return
    
    # ADD THIS: Background noise guard
    if event.confidence < 0.75 or len(event.transcript.strip()) < 3:
        logger.debug(
            "Ignoring low-confidence/short transcript: conf=%.2f len=%d session=%s",
            event.confidence, len(event.transcript.strip()), session_id
        )
        return
    
    # Existing code continues...
    if event.is_final and event.transcript and event.transcript.strip():
        _current_answer_parts[0].append(event.transcript.strip())
```

**Testing**:
1. Make background noise during interview
2. Verify low-confidence transcripts are ignored (check logs)
3. Verify normal speech is still captured

**Estimated Time**: 30 minutes

---

## Phase 3: Verification Tasks

### 3.1 Verify Question Index Behavior

**What to Check**:
1. Does the agent say "Question 1." before the first question?
2. Does the agent say "Question 2." before the second question?
3. Does the interview terminate at exactly `max_questions`?

**How to Test**:
1. Start an interview with 3 questions
2. Listen to the audio - verify "Question X." prefix
3. Answer all 3 questions
4. Verify interview ends after question 3, not question 4

**Files to Review**:
- `backend/app/interview/agent.py`
- `backend/app/interview/question_gen.py`

**If Not Working**: Add question prefix to the LLM instructions or post-process the generated question text.

**Estimated Time**: 1 hour

---

### 3.2 Verify Recruiter UI

**What to Check**:
1. Overall score and band displayed at top
2. Per-question breakdown with all 4 dimension scores
3. AI summary, strengths, concerns displayed
4. Full transcript formatted as conversation
5. Skipped questions explicitly labelled
6. Manual override button exists

**How to Test**:
1. Complete an interview (skip at least one question)
2. Log in as recruiter
3. View the candidate's detail page
4. Verify all required information is present

**If Not Working**: Create or update the recruiter candidate detail page.

**Estimated Time**: 2 hours (if needs creation)

---

## Phase 4: Optional Enhancements (Can Be Done Later)

### 4.1 Transcript Storage Structure

**Problem**: Transcripts are stored as flat strings, not as segment arrays.

**Solution**: Create a new table for transcript segments.

**Why Optional**: The current flat string storage works fine for the recruiter view. Segment storage is mainly useful for:
- Debugging transcript issues
- Showing live transcript during interview
- Forensic analysis of what was said when

**Implementation** (if needed):

**Step 1: Database Migration**

```sql
CREATE TABLE interview_transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT false,
  confidence REAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discarded_reason TEXT, -- null, 'tts_bleed', 'low_confidence', 'empty'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcript_segments_session ON interview_transcript_segments(session_id);
CREATE INDEX idx_transcript_segments_question ON interview_transcript_segments(session_id, question_index);
```

**Step 2: Store Segments**

```python
# backend/app/interview/entrypoint.py

@session.on("user_input_transcribed")
def _on_user_input_transcribed(event: UserInputTranscribedEvent) -> None:
    discarded_reason = None
    
    # TTS gating
    if _tts_active[0]:
        discarded_reason = "tts_bleed"
    
    # Background noise guard
    elif event.confidence < 0.75 or len(event.transcript.strip()) < 3:
        discarded_reason = "low_confidence"
    
    # Store segment (even if discarded, for forensics)
    try:
        insert_record("interview_transcript_segments", {
            "session_id": session_id,
            "question_index": _qa_number[0],
            "text": event.transcript or "",
            "is_final": event.is_final,
            "confidence": event.confidence,
            "discarded_reason": discarded_reason,
        })
    except Exception:
        logger.exception("Failed to store transcript segment session=%s", session_id)
    
    # Only add to answer buffer if not discarded and is final
    if discarded_reason is None and event.is_final and event.transcript and event.transcript.strip():
        _current_answer_parts[0].append(event.transcript.strip())
```

**Step 3: Reconstruct Transcript for Recruiter**

```python
# backend/app/api/interview.py or similar

def get_interview_transcript(session_id: str) -> list[dict]:
    """Reconstruct conversation-style transcript from segments."""
    from app.services.supabase import supabase as sb
    
    # Get all Q&A pairs
    qa_pairs = sb.table("interview_qa").select("*").eq("session_id", session_id).order("question_number").execute().data
    
    # Get all segments (only non-discarded, final ones)
    segments = sb.table("interview_transcript_segments").select("*").eq("session_id", session_id).eq("is_final", True).is_("discarded_reason", "null").order("created_at").execute().data
    
    # Group segments by question
    transcript = []
    for qa in qa_pairs:
        q_num = qa["question_number"]
        q_segments = [s for s in segments if s["question_index"] == q_num]
        
        answer_text = " ".join(s["text"] for s in q_segments).strip()
        if not answer_text:
            answer_text = "[No response — timer expired]"
        
        transcript.append({
            "question_number": q_num,
            "question_text": qa["question_text"],
            "answer_text": answer_text,
            "segments": q_segments  # Optional: include for debugging
        })
    
    return transcript
```

**Estimated Time**: 6 hours

---

## Implementation Timeline

### Week 1: Critical Fixes
- **Day 1**: TTS Gating (1 hour)
- **Day 2**: Page Refresh Protection - Backend (1.5 hours)
- **Day 3**: Page Refresh Protection - Frontend (1.5 hours)
- **Day 4**: Background Noise Guard (0.5 hours)
- **Day 5**: Testing and bug fixes (2 hours)

**Total**: ~6.5 hours of development

### Week 2: Verification
- **Day 1**: Question Index Verification (1 hour)
- **Day 2**: Recruiter UI Verification (2 hours)
- **Day 3**: End-to-end testing (2 hours)
- **Day 4**: Bug fixes and polish (2 hours)

**Total**: ~7 hours of verification and testing

### Optional: Transcript Storage (Future)
- Can be done anytime after Week 2
- Not blocking for spec compliance
- Estimated: 6 hours

---

## Testing Checklist

After implementing all changes, verify:

- [ ] TTS gating: Transcripts during AI speech are discarded
- [ ] Page refresh: Shows warning and redirects to pipeline
- [ ] Back button: Stays on interview page with warning
- [ ] Tab switch: Terminates session immediately
- [ ] Timer: Counts down only during silence
- [ ] Grace period: 3 seconds after user stops speaking
- [ ] Question advancement: Happens after 20s silence or answer completion
- [ ] Question prefix: "Question X." spoken before each question
- [ ] Interview termination: Happens at exactly max_questions
- [ ] Scoring: All 4 dimensions scored per question
- [ ] Overall score: Calculated correctly with weights
- [ ] Band decision: Correct thresholds (80, 55)
- [ ] Synthesis: Summary, strengths, concerns generated
- [ ] Candidate email: No scores, warm tone
- [ ] Recruiter UI: All required information displayed

---

## Rollback Plan

If any change causes issues:

1. **TTS Gating**: Remove the `_tts_active` checks - transcripts will work as before
2. **Page Refresh Protection**: Remove the `beforeunload` and `popstate` listeners - navigation will work as before
3. **Background Noise Guard**: Remove the confidence check - all transcripts will be captured as before

All changes are additive and can be rolled back independently.

---

## Success Criteria

The implementation is complete when:

1. ✅ All Phase 1 changes are deployed and tested
2. ✅ All Phase 2 changes are deployed and tested
3. ✅ All Phase 3 verifications pass
4. ✅ End-to-end interview flow works correctly
5. ✅ No regressions in existing functionality
6. ✅ Spec compliance analysis shows 100% for Parts 1 and 2

---

## Notes

- The current implementation is already 85-90% compliant
- Most changes are small, focused additions
- No major refactoring required
- Existing functionality should not be affected
- Changes can be deployed incrementally

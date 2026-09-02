# Implementation Plan: Tab Switch Bug Fix + AI Interview Summary

## Task 1: Fix Tab Switch/Refresh Behavior

### Current Behavior (Bug)
- After interview starts (or is terminated by tab switch), candidate refreshes page
- Redirected to `/portal` correctly ✅
- Portal still shows "Start Interview" button ❌
- Candidate can click button and potentially restart ❌

### Required Behavior (Per Spec)
- Once interview session starts, it can NEVER be restarted
- Portal should NEVER show "Start Interview" button after session has started
- This applies even if session was terminated (tab switch, abandoned, or completed)
- Only exception: Network disconnection with 5-minute reconnection window

### Root Cause
Portal page checks `status === "interview_invited" || status === "interview_sent"` to show button.
It doesn't check if an interview session already exists for this application.

### Solution
1. Check if interview_sessions exist for the application
2. If any session exists (regardless of status), hide the "Start Interview" button
3. Show appropriate message based on session status:
   - `completed`: "Interview completed"
   - `terminated_tab_switch`: "Interview terminated due to tab switch violation"
   - `terminated_abandoned`: "Interview session ended"
   - `in_progress`: "Interview in progress" (shouldn't happen, but handle it)

### Files to Modify
- `frontend/app/(candidate)/portal/page.tsx` - Add session check logic

---

## Task 2: Add AI Interview Summary Feature

### Current State
- Interview report HAS a summary field ✅
- Summary is displayed in a card, but NOT at the top ❌
- Summary is basic, not the comprehensive format required by spec ❌

### Required Behavior (Per Spec)
**Placement:**
- AI Interview Summary card appears **at the very top** of the interview view
- Positioned **directly above** everything else (before grade, before transcript)

**Content (5 sections):**
1. **Overall Performance** (2-3 sentences)
2. **Key Strengths** (3-5 bullet points)
3. **Areas of Concern** (3-5 bullet points)
4. **Notable Responses** (2-3 specific examples)
5. **Recommendation** (1-2 sentences with clear sentiment)

**UI Requirements:**
- Title: "AI Interview Summary"
- Subtle background color (light blue/gray)
- Subtle border
- Loading state: "Generating AI summary..."
- Error state: "Unable to generate summary. Please try again later."
- Empty state: "Interview summary will be available after the interview is completed."

### Current Implementation Gap
The existing `report.summary` field is a single paragraph. We need:
1. A NEW API endpoint: `GET /api/v1/interview/{session_id}/summary`
2. Enhanced LLM prompt to generate structured summary with all 5 sections
3. New UI component to display at the top
4. Loading/error/empty states

### Solution Approach
**Option A: Use existing report.summary (Quick)**
- Reposition existing summary card to top
- Enhance the summary generation in evaluator to include all 5 sections
- Parse and display structured content

**Option B: New endpoint (Per Spec)**
- Create new `/summary` endpoint
- Generate on-demand when recruiter opens interview view
- Cache result to avoid regenerating

**Decision: Option A (simpler, uses existing data)**
- The report is already generated after interview
- Summary is already in the report
- Just need to enhance the prompt and reposition the UI
- Avoids additional API calls and caching complexity

### Files to Modify
1. `backend/app/interview/evaluator.py` - Enhance summary generation prompt
2. `frontend/components/admin/interview-report.tsx` - Move summary to top, enhance UI
3. Database: No schema changes needed (summary field already exists)

---

## Implementation Order

### Phase 1: Tab Switch Bug Fix (High Priority)
1. Read current portal page logic
2. Add query to check for existing interview sessions
3. Hide "Start Interview" button if session exists
4. Add appropriate status messages
5. Test: Start interview → refresh → verify button is gone

### Phase 2: AI Summary Enhancement (Feature)
1. Update evaluator prompt to generate structured 5-section summary
2. Modify interview-report component to move summary to top
3. Enhance summary card UI (styling, sections, formatting)
4. Add loading/error/empty states
5. Test with completed interviews

---

## Testing Checklist

### Tab Switch Bug
- [ ] Start interview, refresh page → button hidden
- [ ] Start interview, switch tabs (terminated) → button hidden
- [ ] Complete interview normally → button hidden
- [ ] Never started interview → button still shows
- [ ] Multiple applications: only hide button for started ones

### AI Summary
- [ ] Summary appears at top of interview view
- [ ] Summary has all 5 sections
- [ ] Summary is visually distinct
- [ ] Loading state works (if applicable)
- [ ] Error handling works
- [ ] Empty state for incomplete interviews
- [ ] Transcript still displays correctly below

---

## Spec Compliance

### Tab Switch (Already in Spec)
✅ Section: "Session Integrity" → "REFRESH / BACK NAVIGATION = PERMANENT EXIT"
- Spec already covers this requirement
- Implementation just needs to match spec

### AI Summary (Already in Spec)
✅ Section: "AI Interview Summary *(mandatory)*"
- Spec has complete requirements
- Implementation needs to match spec exactly

**No spec changes needed** - both features are fully documented.

---

## Risk Assessment

### Tab Switch Fix
- **Risk: Low**
- Simple query addition
- No breaking changes
- Clear success criteria

### AI Summary
- **Risk: Medium**
- Requires LLM prompt changes (could affect quality)
- UI repositioning (could affect layout)
- Need to ensure backward compatibility with existing reports

---

## Rollback Plan

### Tab Switch
- Revert portal page changes
- Button will reappear (back to buggy state)

### AI Summary
- Revert evaluator prompt changes
- Revert UI component changes
- Old summary format will return


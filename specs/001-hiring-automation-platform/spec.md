# Feature Specification: AI-Powered Hiring Automation Platform

**Feature Branch**: `001-hiring-automation-platform`
**Created**: 2026-04-05
**Status**: Draft
**Input**: User description: "AI-powered hiring automation platform that automates resume screening and first-level interviews"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Creates and Publishes a Hiring Post (Priority: P1)

An admin logs into the dashboard and creates a new hiring post by entering
job details (title, department, location, JD, required skills, experience
range, education requirements), configuring screening thresholds and scoring
weights, setting up an interview template, and publishing the post with a
deadline. The system generates a shareable application link.

**Why this priority**: Without a published hiring post, no candidate can
apply and no downstream automation triggers. This is the entry point for
the entire pipeline.

**Independent Test**: Admin can create, configure, publish, and share a
hiring post. The post transitions through states (Draft → Published →
Closed → Archived) and the shareable link resolves correctly.

**Acceptance Scenarios**:

1. **Given** an admin is logged in, **When** they fill out all required
   job fields and click "Publish Now," **Then** the post status changes to
   "Published" and a shareable application link is generated.
2. **Given** a published post with a 5-day deadline, **When** the deadline
   passes, **Then** the post automatically transitions to "Closed" and no
   new applications are accepted.
3. **Given** a published post, **When** the admin clicks "Close" manually,
   **Then** the post transitions to "Closed" immediately.
4. **Given** a draft post, **When** the admin schedules publication for a
   future date and time, **Then** the post automatically transitions to
   "Published" at the scheduled time.

---

### User Story 2 - Candidate Applies to a Hiring Post (Priority: P1)

A candidate opens the shareable application link and fills out a minimal
form: full name, email, phone, current role/company, years of experience,
location. They upload a profile photo and a resume (PDF or DOCX, max 5MB).
On submission, they receive a confirmation email with a link to their
candidate portal.

**Why this priority**: Candidate application is the second critical path
element. Without applications flowing in, the screening pipeline has
nothing to process.

**Independent Test**: A candidate can open the application link, fill the
form, upload a resume, submit, and receive a confirmation email with a
portal link.

**Acceptance Scenarios**:

1. **Given** a valid application link for a published post, **When** a
   candidate fills all required fields, uploads a PDF resume under 5MB,
   and submits, **Then** the application is stored and a confirmation
   email is sent within 2 minutes.
2. **Given** an application link for a closed post, **When** a candidate
   visits the link, **Then** they see a message that applications are no
   longer accepted.
3. **Given** a candidate uploads a file larger than 5MB or an unsupported
   format, **When** they attempt to submit, **Then** a clear error
   message is shown and the form is not submitted.

---

### User Story 3 - Automated Resume Screening and Ranking (Priority: P1)

Immediately after a candidate submits their application, the system
automatically parses the resume into structured markdown and fields,
runs a three-layer scoring pipeline (embedding similarity, LLM skill
match, LLM experience match, LLM culture match) against the JD, and
populates a standardized candidate table with scores. Candidates above
the threshold are auto-advanced to interview; below are rejected or
flagged for review.

**Why this priority**: Automated screening is the core value proposition.
It eliminates the manual bottleneck of reviewing hundreds of resumes.

**Independent Test**: Upload a resume to a published post and verify that
within minutes, the candidate table shows parsed fields, all four score
dimensions, an overall weighted score, and the correct auto-advance or
rejection status based on the threshold.

**Acceptance Scenarios**:

1. **Given** a candidate submits a resume, **When** the screening pipeline
   completes, **Then** the candidate table shows parsed name, email,
   current role, experience years, education, key skills, and all four
   scores (embedding, skill match, experience match, culture match) plus
   a weighted overall score.
2. **Given** a candidate scores 75% on a post with a 70% threshold,
   **When** screening completes, **Then** the candidate status is set to
   "Interview Sent" and an interview invitation email is dispatched.
3. **Given** a candidate scores 60% on a post with a 70% threshold,
   **When** screening completes, **Then** the candidate status is set to
   "Rejected."
4. **Given** a candidate scores 67% on a post with a 70% threshold (within
   5% borderline range), **When** screening completes, **Then** the
   candidate is flagged for recruiter review.

---

### User Story 4 - AI Voice Interview (Priority: P1)

A candidate who passes screening receives an interview invitation email
with a time window. They click the link, authenticate via OTP, complete a
pre-interview checklist (mic check, consent), and start a real-time voice
interview with an AI interviewer. The AI asks dynamic questions based on
the candidate's resume and the JD, follows up adaptively, and concludes
after 10 questions or 30-45 minutes.

**Why this priority**: The AI interview is the second core value
proposition, replacing the manual first-round interview entirely.

**Independent Test**: A qualified candidate can receive the invitation,
authenticate, pass the pre-interview checklist, conduct a full voice
conversation with the AI, and receive a completion confirmation.

**Acceptance Scenarios**:

1. **Given** a candidate with "Interview Sent" status clicks the
   interview link within the time window, **When** they enter their email
   and verify via OTP, **Then** they land on the pre-interview checklist
   page.
2. **Given** a candidate has completed the pre-interview checklist and
   granted mic permission, **When** they click "Start Interview," **Then**
   the AI interviewer greets them and asks the first question via voice.
3. **Given** an ongoing interview, **When** the candidate answers a
   question, **Then** the AI responds within 2 seconds with either a
   follow-up or a new question, acknowledging the previous answer.
4. **Given** an interview has reached 10 questions or 45 minutes, **When**
   the boundary is hit, **Then** the AI wraps up the conversation
   naturally and the session ends with a completion confirmation.
5. **Given** a candidate's interview link has expired (past the time
   window), **When** they click the link, **Then** they see a message
   that the interview window has closed.

---

### User Story 5 - Interview Evaluation and Reporting (Priority: P2)

After an interview session closes, the system automatically evaluates each
answer across four dimensions (technical accuracy, depth of understanding,
communication clarity, relevance to JD), computes an overall interview
grade, generates a written AI summary, and produces a structured interview
report accessible on the recruiter dashboard.

**Why this priority**: Without evaluation, the interview data is raw and
unactionable. Scoring and reporting enable recruiters to make decisions
from the dashboard without listening to every recording.

**Independent Test**: After an interview completes, the recruiter can view
the interview report with per-question scores, full transcript, audio
playback, and AI summary with recommendation.

**Acceptance Scenarios**:

1. **Given** an interview session has ended, **When** evaluation completes,
   **Then** the recruiter dashboard shows an overall interview grade
   (0-100) and a recommendation (Advance / Borderline / Reject).
2. **Given** a completed evaluation, **When** the recruiter opens the
   candidate detail page, **Then** they see per-question breakdown with
   the question asked, candidate answer transcript, scores across four
   dimensions, and AI rationale for each score.
3. **Given** a completed evaluation, **When** the recruiter clicks "Play
   Recording," **Then** the full interview audio plays with seek controls.

---

### User Story 6 - Candidate Portal with Status Tracking (Priority: P2)

After applying, the candidate can access their portal via the link in the
confirmation email. They authenticate with email + OTP and see their
real-time application status (Applied → Screening Complete → Interview
Invited → Interview Complete → Decision Pending → Outcome). They receive
email notifications at each status change.

**Why this priority**: Candidate experience is essential for employer
brand. Transparency reduces inbound status-check inquiries and builds
trust.

**Independent Test**: A candidate can log into the portal, see their
current status, receive email notifications on status changes, and access
the interview when invited.

**Acceptance Scenarios**:

1. **Given** a candidate who has applied, **When** they enter their email
   and verify OTP on the portal, **Then** they see their current
   application status and the role they applied for.
2. **Given** a candidate whose status changes from "Applied" to "Screening
   Complete," **When** the transition occurs, **Then** the candidate
   receives an email notification and the portal reflects the new status.
3. **Given** a candidate with "Interview Invited" status, **When** they
   log into the portal, **Then** they see the pre-interview checklist and
   a "Start Interview" button (if within the time window).

---

### User Story 7 - Candidate Comparison (Priority: P2)

A recruiter selects 2-4 candidates for the same role and views a
side-by-side comparison showing score radar charts, skill overlap,
experience timelines, and AI summaries.

**Why this priority**: Comparison accelerates final shortlisting by
surfacing relative strengths and weaknesses at a glance.

**Independent Test**: Select multiple candidates on the candidate table
and verify the comparison view renders radar charts, skill overlap, and
experience timelines correctly.

**Acceptance Scenarios**:

1. **Given** a recruiter selects 3 candidates from the candidate table,
   **When** they click "Compare," **Then** a side-by-side view displays
   with radar charts of scores, skill overlap visualization, and
   experience timelines.
2. **Given** a comparison view is open, **When** the recruiter deselects
   one candidate, **Then** the view updates to show only the remaining
   candidates.

---

### User Story 8 - Analytics Dashboard (Priority: P3)

Admins and recruiters access an analytics page showing funnel
visualization (applied → screened → interviewed → shortlisted → hired),
conversion rates at each stage, timing metrics (time-to-screen,
time-to-interview), score distributions, and pass rates. Data is
exportable to CSV and PDF.

**Why this priority**: Analytics provide strategic insight but are not
required for the core hiring pipeline to function. They enhance
decision-making once the pipeline is operational.

**Independent Test**: With at least 10 candidates in various pipeline
stages, the analytics page renders a funnel chart, conversion rates, and
timing metrics. CSV export downloads correctly.

**Acceptance Scenarios**:

1. **Given** a hiring post with candidates at various stages, **When**
   the recruiter opens the analytics page, **Then** a funnel
   visualization shows candidate count and conversion rate at each stage.
2. **Given** analytics data is displayed, **When** the recruiter clicks
   "Export CSV," **Then** a CSV file downloads containing all displayed
   metrics.

---

### User Story 9 - Interview Template Management (Priority: P2)

Admins create, edit, clone, and manage interview templates. Each template
defines question count, duration, question track split (foundational vs
project-based), scoring weights, and must-ask topics. Role presets are
available for common positions.

**Why this priority**: Templates enable consistency across interviews for
the same role and allow customization per position type.

**Independent Test**: Admin can create a template, configure all fields,
clone it, edit the clone, and assign it to a hiring post.

**Acceptance Scenarios**:

1. **Given** an admin is on the interview templates page, **When** they
   create a new template with 8 questions, 30-minute duration, and 60/40
   foundational/project split, **Then** the template is saved and
   available for selection on hiring posts.
2. **Given** an existing template, **When** the admin clicks "Clone,"
   **Then** a copy is created with "(Copy)" appended to the name, ready
   for editing.

---

### User Story 10 - Team Management and Settings (Priority: P3)

Admins manage their team by inviting recruiters and hiring managers,
assigning roles (admin, recruiter, hiring manager), and configuring
organization-wide settings: email templates, default thresholds, scoring
weights, and data retention policies.

**Why this priority**: Team management is essential for multi-user
organizations but a single admin can operate the platform without it.

**Independent Test**: Admin can invite a recruiter, assign them to specific
jobs, and verify the recruiter sees only their assigned jobs.

**Acceptance Scenarios**:

1. **Given** an admin on the settings page, **When** they invite a
   recruiter by email and assign them to two jobs, **Then** the recruiter
   receives an invitation email and, after accepting, sees only the two
   assigned jobs.
2. **Given** a hiring manager with view-only access, **When** they open a
   candidate report via a shared link, **Then** they can view all report
   details but cannot modify candidate status or add notes.

---

### Edge Cases

- What happens when a candidate applies twice to the same post?
  Duplicate detection by email; second application is rejected with a
  message directing them to their existing portal.
- What happens if resume parsing fails (corrupted file, scanned image PDF)?
  The candidate status is set to "Parsing Failed" and the recruiter is
  notified for manual review. Candidate receives an email asking to
  re-upload.
- What happens if the AI interview disconnects mid-session?
  The session state is preserved. The candidate can reconnect within 5
  minutes and resume from where they left off. If they do not reconnect,
  the partial interview is evaluated on available answers.
- What happens if the voice pipeline latency exceeds the 2-second target?
  A graceful fallback message ("Let me think about that for a moment...")
  is played while the system catches up. If latency exceeds 10 seconds,
  the candidate is informed and the session can be rescheduled.
- What happens if two admins edit the same hiring post simultaneously?
  Last-write-wins with a warning. The second admin sees a notification
  that the post was recently modified by another user.

## Interview Session Behavior *(mandatory)*

These rules define the exact behavior of the AI voice interview session. All implementations must strictly adhere to these requirements.

### Timer Behavior

**TIMER START**
- The 15-second countdown begins when the agent finishes speaking a question and transitions to "listening" state.
- This occurs immediately after the text-to-speech audio ends.
- The timer MUST NOT start before the audio begins or while the audio is playing.
- The timer MUST NOT start on question load or text display.

**TIMER FREEZE ON SPEECH**
- The moment the candidate begins speaking (detected by Voice Activity Detection), the timer MUST freeze immediately.
- The elapsed time is snapshotted and the remaining time is preserved.
- The timer MUST remain frozen for the entire duration the candidate is speaking.
- No countdown progression is allowed while speech is detected.

**GRACE PERIOD AFTER SPEECH**
- When the candidate stops speaking, a 3-second grace period begins automatically.
- During the grace period, the timer remains hidden and does not count down.
- The grace period allows for natural thinking pauses and prevents premature advancement.
- If the candidate starts speaking again during the grace period, the grace period is cancelled and the timer remains frozen.

**SMART ADVANCEMENT AFTER GRACE PERIOD**
- After the 3-second grace period ends, the system checks the word count of the candidate's answer:
  - **0-5 words**: Insufficient for a complete answer. Timer resumes from the remaining time.
  - **6-15 words**: Partial answer. System waits 4 seconds of confirmation silence before advancing.
  - **16-30 words**: Moderate answer. System waits 3 seconds of confirmation silence before advancing.
  - **31+ words**: Complete answer. System waits 2 seconds of confirmation silence before advancing.
- If the candidate speaks again during confirmation silence, the advancement is cancelled and the grace period restarts.
- This tiered approach prevents cutting off candidates mid-thought while ensuring natural conversation flow.

**TIMER RESUME (INSUFFICIENT WORDS)**
- If the candidate spoke fewer than 6 words, the timer resumes from wherever it was frozen.
- The timer continues counting down from the remaining time (not reset to 15 seconds).
- This cycle can repeat: candidate speaks → timer freezes → candidate stops → grace period → timer resumes.

### Question Advancement

**ADVANCEMENT TRIGGERS**
- The system advances to the next question via two mechanisms:
  1. **Timer Expiration** (Primary): Timer counts down to 0 with no speech detected.
  2. **Confirmation Silence** (Secondary): After sufficient words (6+) and appropriate silence duration (2-4s based on word count).
- Both mechanisms ensure the candidate has finished their answer before advancing.
- There is no manual "next" trigger during a live question.
- The candidate cannot skip questions.

**NO RESPONSE HANDLING**
- If the candidate never speaks and the timer reaches 0, the system logs that question as "no response."
- The system speaks: "I didn't hear a response, so let's move on."
- The system then fetches the next question directly from the question generator (bypassing LLM acknowledgement).
- The next question is spoken immediately after the transition message.
- This provides context to the candidate while maintaining interview flow.

**PARTIAL RESPONSE HANDLING**
- If the candidate spoke 1-5 words and the timer reaches 0, the system treats it as an answered question (not "no response").
- The system uses the LLM to generate a brief acknowledgement and ask the next question.
- This prevents the system from rudely saying "I didn't hear a response" when the candidate did speak.

**QUESTION COUNT ENFORCEMENT**
- The interview MUST ask exactly the number of questions set by the recruiter. No more, no less.
- Once the last question is answered or times out, the interview MUST end immediately.
- The system MUST NOT loop, add filler questions, or extend the session.

### Audio-Text Synchronization

**CONVERSATIONAL FLOW**
- When a candidate provides a sufficient answer (6+ words with confirmation silence), the system uses the LLM to generate a natural transition.
- The LLM generates: "That's a great point about X. Let me ask you about Y..." (brief acknowledgement + next question).
- The `session.say()` function speaks this text via TTS.
- The spoken text is automatically extracted and displayed on screen.
- This maintains natural, conversational interview flow rather than robotic question delivery.

**ATOMIC AUDIO-TEXT DELIVERY**
- The `session.say()` function handles both audio playback and text extraction atomically.
- Text display is derived from the audio content, ensuring perfect synchronization.
- Text appears as the audio begins speaking and matches exactly what is being spoken.

### Repeat Request Handling

**REPEAT FUNCTIONALITY**
- Candidates can request a question repeat by saying phrases like "repeat," "say that again," "can you repeat," etc.
- The system detects repeat requests if the utterance is ≤15 words and contains a repeat phrase.
- **First repeat**: The system interrupts itself and repeats the question verbatim.
- **Second repeat**: The system responds "I can only repeat each question once — please go ahead and answer."
- The timer remains paused at its current value during repeat requests (not reset).
- Repeat allowance resets for each new question.

### Session Integrity

**TAB SWITCH DETECTION**
- If the candidate switches to any other tab at any point during the interview, the system MUST terminate the interview session immediately.
- The termination MUST be logged as a violation with status "terminated_tab_switch."
- The end state MUST be the same as a completed interview (no retake allowed).
- The candidate MUST NOT be able to resume or restart the interview.
- A termination email is sent to the candidate explaining the violation.

**REFRESH / BACK NAVIGATION = PERMANENT EXIT**
- If the candidate refreshes the page or navigates back during an active interview, the session MUST be permanently closed.
- The `beforeunload` event clears `sessionStorage` synchronously to prevent re-entry.
- On reload or back navigation, the candidate MUST always land on the portal page (not the interview room).
- Under no circumstances MUST the platform allow the candidate to re-enter or retake the same interview once a session has started.
- This is a hard rule with no exceptions.
- The system MUST NOT implement any resume, rejoin, or retry logic for started sessions.

**RECONNECTION WINDOW (EXCEPTION)**
- If the candidate disconnects due to network issues (not tab switch or refresh), they have a 5-minute window to reconnect.
- The session state is preserved during this window.
- If they reconnect within 5 minutes, the interview resumes from where it left off.
- If they do not reconnect within 5 minutes, the partial interview is evaluated on available answers.

### Interview Closing

**LAST QUESTION HANDLING**
- When the last question is answered or times out, the system sends an "interview_closing" event to the frontend.
- The frontend clears the timer and displays a "Wrapping up your interview..." banner.
- The system speaks a goodbye message: "That was the last question. Thank you for your time and thoughtful responses. The interview is now complete. We'll be in touch soon. Goodbye!"
- The system waits 3 seconds for the TTS audio to fully play before disconnecting.
- The frontend then shows an "Interview Complete" screen and redirects to the portal.

## Implementation Constraints *(mandatory)*

These are hard rules that must be followed every time code is written or modified for this platform. These constraints serve as evaluation criteria for all implementations.

### A. MODULE ISOLATION

- Every feature MUST live in its own file/module.
- Timer logic, speech detection, tab guard, audio playback, and interview orchestration MUST be clearly separated.
- When adding a feature, identify which module owns it and only touch that file when possible.
- Clear separation of concerns is mandatory.

**Current Module Structure:**
- `backend/app/interview/entrypoint.py` - Interview orchestration, state machine, timer management, event handlers
- `backend/app/interview/agent.py` - LiveKit agent configuration, STT/TTS/LLM setup, VAD settings
- `backend/app/interview/question_gen.py` - Dynamic question generation, conversation history
- `frontend/components/candidate/interview-room.tsx` - Interview UI, timer display, state management
- `frontend/app/(candidate)/interview/session/page.tsx` - Session validation, navigation guards

### B. NO SILENT REGRESSIONS

- Before modifying any file, explicitly state which functions or behaviors in that file are currently working and must not change.
- After modification, verify that those functions are still intact.
- If a working feature breaks as a result of a change, that is a failed implementation regardless of whether the new feature works.
- All existing functionality must be preserved unless explicitly marked for removal.

### C. STATE OWNERSHIP

- There MUST be one single source of truth for interview session state.
- The backend (`entrypoint.py`) owns the authoritative state:
  - Current question index (`_qa_number`)
  - Timer value (`_timer_remaining`)
  - Speech active flag (`_user_state`)
  - Session status (`_interview_phase`, `_awaiting_close`)
  - Grace period state (`_grace_task`)
- The frontend maintains derived state for UI rendering:
  - `userSpeaking` - Derived from backend `user_speaking` events
  - `graceActive` - Derived from backend `grace_period_started` events
  - `noResponseSecondsLeft` - Derived from backend `timer_started` events
  - `interviewActive` - Derived from backend `question_progress` events
- All state changes flow from backend to frontend via data channel events.
- Frontend never modifies authoritative state; it only renders derived state.

### D. TIMER IS DRIVEN BY AUDIO AND SPEECH EVENTS ONLY

- The timer MUST be controlled by specific events only:
  - **Start**: Agent state changes to "listening" (after TTS audio ends)
  - **Freeze**: User state changes to "speaking" (VAD detects speech)
  - **Resume**: Grace period ends with insufficient words (<6 words)
  - **Expire**: Timer countdown reaches 0
- The timer MUST NOT be started, stopped, or modified by:
  - UI events
  - Component mounts
  - Side effects
  - Manual triggers
- This is a strict event contract enforced by the backend state machine.

### E. SESSION TERMINATION IS ONE-WAY

- Once a session is marked as terminated (by tab switch, refresh, back navigation, or natural completion), it MUST NOT be reopened, resumed, or reset by any code path.
- The session record is created in the database when the session starts with status "in_progress."
- Termination updates the status to "completed," "terminated_tab_switch," or "terminated_abandoned."
- Any route or page load MUST check the session status before rendering the interview UI.
- A terminated session is permanent and irreversible.
- **Exception**: Network disconnections allow 5-minute reconnection window (not tab switch or refresh).

### F. CONVERSATIONAL FLOW VIA LLM

- When a candidate provides a sufficient answer (6+ words with confirmation silence), the system uses the LLM to generate natural transitions.
- The LLM generates brief acknowledgements followed by the next question in a single conversational turn.
- The `session.say()` function delivers both audio and text atomically.
- For no-response scenarios, the system bypasses the LLM and uses hardcoded transitions to maintain efficiency.
- This approach balances natural conversation flow with system performance.

### G. QUESTION BOUNDARY IS FINAL

- The question list is generated dynamically during the interview based on:
  - Candidate's resume
  - Job description
  - Conversation history (to avoid repetition)
  - Foundational vs. project-based split (60/40)
- Each question is generated when needed (not pre-generated).
- The question index increments exactly once per question, only when advancement occurs.
- There is no skip, no jump, no reorder.
- The question sequence is determined by the question generator's logic and conversation history.

### H. BEFORE YOU WRITE ANY CODE

Before implementing any feature or fix, the following process MUST be followed:

1. Read this SPEC.md in full.
2. List every file you plan to modify.
3. State what is currently working in each of those files that you will preserve.
4. Only then proceed with implementation.
5. If the task requires touching more than 3 files, flag it and ask for confirmation before proceeding.

This process ensures that changes are deliberate, scoped, and do not introduce regressions.

### I. GRACE PERIOD AND SMART ADVANCEMENT

- The grace period system (3s + tiered confirmation silence) is a core feature that MUST be preserved.
- This system prevents premature advancement and allows natural conversation flow.
- The tiered silence thresholds (2-4s based on word count) are carefully tuned and MUST NOT be modified without extensive testing.
- Any changes to grace period logic require approval and testing with real candidates.

### J. EVENT-DRIVEN ARCHITECTURE

- The interview system uses an event-driven architecture with clear event contracts:
  - Backend publishes events via LiveKit data channel
  - Frontend subscribes to events and updates UI accordingly
  - Events include: `timer_started`, `grace_period_started`, `timer_resumed`, `user_speaking`, `agent_speaking`, `question_progress`, `interview_closing`, `session_end`, `terminated`
- All new features MUST follow this event-driven pattern.
- Direct state manipulation is prohibited; all state changes MUST flow through events.

## Requirements *(mandatory)*

## Candidate Management Table

### Feature Overview and Purpose

This feature adds a net-new recruiter-facing candidate management section on
the job detail page to let recruiters:
- view all candidates for the current job posting,
- search and filter candidates by status and profile details, and
- send scoped bulk emails to either shortlisted candidates or interview
  rejected candidates.

The feature improves recruiter throughput without changing existing job detail
content above this section.

### Exact Location on Page

The section is rendered on the recruiter job detail page, directly below the
existing `Scoring Weights` section.

No existing UI above that boundary may be modified, replaced, or reordered:
- Job title / status / Edit / Close controls
- Stat cards (Applications, Experience, Screening Threshold)
- Share Link
- Job Description
- Required Skills
- Scoring Weights

This feature does not alter the Jobs list page, its table, or the row-level
`View` button behavior.

### Scope and Data Boundary

- Candidate data is scoped strictly by the current job posting ID already in
  job detail page context.
- Every fetch, search, filter, recipient derivation, and email send action is
  constrained by that job posting ID.
- Candidates from other jobs must never be rendered or targeted for email.

### UI Structure and Layout

Section layout (top to bottom):
1. Section header (title + optional summary count for current filtered view).
2. Top controls row:
   - Left: debounced search input
   - Right: status filter dropdown, bulk shortlisted email button, bulk
     interview-rejected email button
3. Candidate table:
   - Columns in exact order:
     `Name | Email | Job | Key Skills | Overall | Status`
4. Table footer:
   - pagination controls and page size selector
5. Modal layer (conditionally rendered):
   - `Email Shortlisted Candidates` modal
   - `Email Interview Rejected Candidates` modal

Responsive behavior:
- Horizontal overflow is handled gracefully; table remains usable on narrow
  widths.
- Column content truncates/wraps safely without layout breakage.

### Candidate Table Behavior

- Pagination is enabled once candidate count exceeds configured page size.
- Pagination state persists during ordinary page navigation.
- Pagination resets to page 1 on search query change.
- Pagination resets to page 1 on status filter change.
- Loading state blocks controls and shows loading indicator.
- During reloads, stale rows are not displayed.
- Empty states are distinct:
  - No candidates for this job at all.
  - Candidates exist but none match current search/filter.

### Search Behavior

- Search box is positioned at top-left above the table.
- Search is case-insensitive.
- Search fields: candidate name, candidate email, key skills.
- Input is debounced (target 300ms).
- Search runs against in-memory already-loaded candidates where possible.
- Search does not trigger API fetch per keystroke.
- Search preserves active status filter.
- Search changes reset pagination to page 1.
- Clearing search restores full list under current status filter.

### Status Filter Behavior

Dropdown values (exact order):
1. All Statuses
2. Applied
3. Screened
4. Interview Sent
5. Interviewed
6. Shortlisted
7. Resume Rejected
8. Interview Rejected

Rules:
- Default selection: `All Statuses`.
- Filter applies immediately.
- Filter composes with active search query.
- Filter selection persists across pagination.
- Filter changes reset pagination to page 1.
- Switching back to `All Statuses` restores full searched list.

### Bulk Email Controls

Top-right controls include:
1. Status filter dropdown
2. Button: `Send Bulk Email to Shortlisted Candidates`
3. Button: `Send Bulk Email to Rejected Candidates`

#### Shortlisted Button Rules

- Recipients: candidates with status `Shortlisted` only.
- If recipient count is 0:
  - button disabled
  - tooltip: `No shortlisted candidates for this role`
- If recipient count > 0:
  - button enabled
  - opens shortlisted email modal

#### Interview Rejected Button Rules

- Recipients: candidates with status `Interview Rejected` only.
- `Resume Rejected` is explicitly excluded from this action.
- If recipient count is 0:
  - button disabled
  - tooltip: `No interview rejected candidates for this role`
- If recipient count > 0:
  - button enabled
  - opens rejected email modal

### Email Modal Structure and Behavior

Shortlisted modal:
- Header: `Email Shortlisted Candidates`
- Recipient line example: `Sending to 6 Shortlisted candidates`

Rejected modal:
- Header: `Email Interview Rejected Candidates`
- Recipient line example: `Sending to 3 Interview Rejected candidates`

Both modals include:
- Required subject input
- Required body textarea
- Attachment upload
  - accepts images, PDFs, and document files
  - supports multiple files
  - shows file name + remove action per file
- `Send` action
  - disabled until subject and body are non-empty
  - loading state while sending
  - success: close modal + show success notification
  - failure: keep modal open + show inline error + preserve draft
- `Cancel` action
  - closes modal
  - discards draft content
  - no send call

### Recipient Derivation Logic

- Recipients are derived from already-loaded in-memory candidate source list
  at click/send time.
- Recipient derivation must not trigger a fresh API fetch.
- Recipient subset always includes the current job posting ID constraint.
- Recipient subsets:
  - shortlisted flow: status == `Shortlisted`
  - rejected flow: status == `Interview Rejected`

### Email Delivery and Transport Requirement

- Bulk email send uses the project's existing configured production email
  transport.
- No mock/stub/simulated transport is allowed for this flow.
- Sends are real and must reach recipient inboxes.

### Single Source of Truth and State Ownership Map

All feature state is owned at the feature container level (job detail page
candidate management feature controller). UI subcomponents are render-only and
receive props/callbacks; they do not own duplicate business state.

| State Variable | Type | Owner | Writable By |
|---|---|---|---|
| `sourceCandidates` | `Candidate[]` | Feature container | Candidate data service fetch success handler only |
| `derivedCandidates` | `Candidate[]` (computed) | Derived selector layer | Read-only derived from source + query + filter |
| `searchQuery` | `string` | Feature container | Search controller only |
| `debouncedSearchQuery` | `string` | Feature container | Debounce controller only |
| `statusFilter` | `CandidateStatusFilter` | Feature container | Filter controller only |
| `pagination.page` | `number` | Feature container | Pagination/search/filter controllers |
| `pagination.pageSize` | `number` | Feature container | Pagination controller only |
| `isCandidatesLoading` | `boolean` | Feature container | Candidate fetch lifecycle only |
| `candidatesLoadError` | `string \\| null` | Feature container | Candidate fetch lifecycle only |
| `isShortlistedModalOpen` | `boolean` | Feature container | Modal controller only |
| `isRejectedModalOpen` | `boolean` | Feature container | Modal controller only |
| `emailDraft.kind` | `"shortlisted" \\| "rejected" \\| null` | Feature container | Modal open handlers only |
| `emailDraft.subject` | `string` | Feature container | Email compose controller only |
| `emailDraft.body` | `string` | Feature container | Email compose controller only |
| `emailDraft.attachments` | `AttachmentDraft[]` | Feature container | Attachment controller only |
| `isEmailSending` | `boolean` | Email orchestration layer | Email send lifecycle only |
| `emailSendError` | `string \\| null` | Email orchestration layer | Email send lifecycle only |
| `emailSendSuccess` | `boolean` | Email orchestration layer | Email send lifecycle only |

### Layer Boundaries and Architecture

Strict separation:
- UI components:
  - render table, controls, modals, and visual states only
  - emit interaction callbacks
  - contain no candidate filtering/search/business orchestration logic
- Feature state/controller layer:
  - owns source state, derived selectors, pagination, modal state, compose
    state, and interaction reducers
- Candidate data service layer:
  - all candidate fetch calls
  - API request/response mapping
- Email orchestration layer:
  - recipient derivation from in-memory state
  - payload assembly (subject/body/attachments/recipients/job ID)
  - delivery invocation via existing transport endpoint
  - success/error state transitions
- API layer:
  - receives scoped requests
  - validates job ID and recipient scopes
  - delegates to configured email transport provider

Prohibitions:
- No duplicate candidate list copies across parent/child.
- No business logic inside table or modal visual components.
- No recipient lookup API call at send time.

### Complete Event Flow (Recruiter Action to Outcome)

#### Candidate Table Load
1. Job detail page mounts with `jobPostingId`.
2. Candidate data service fetches candidates for that `jobPostingId`.
3. Feature container sets loading true, disables controls.
4. On success, updates `sourceCandidates`, computes derived list, enables
   controls.
5. On failure, sets error state and recovery CTA.

#### Search Flow
1. Recruiter types search text.
2. `searchQuery` updates immediately; debounce timer starts.
3. On debounce settle, `debouncedSearchQuery` updates.
4. Derived selector recomputes filtered list using status + search.
5. Pagination resets to page 1.
6. Table rerenders matching rows or contextual empty state.

#### Filter Flow
1. Recruiter selects status in dropdown.
2. `statusFilter` updates.
3. Derived selector recomputes using current debounced search query.
4. Pagination resets to page 1.
5. Table rerenders matching rows.

#### Shortlisted Bulk Email End-to-End
1. Recruiter clicks `Send Bulk Email to Shortlisted Candidates`.
2. Controller derives recipients from in-memory scoped list:
   status == `Shortlisted`.
3. If none, button remains disabled with tooltip.
4. If recipients exist, modal opens showing recipient count.
5. Recruiter enters subject/body, uploads attachments.
6. `Send` enabled only when required fields are filled.
7. On click `Send`, email orchestration layer:
   - validates draft
   - builds payload with `jobPostingId`, recipients, draft, attachments
   - sends via existing transport API
8. Success path:
   - show success notification
   - close modal
   - clear compose state
9. Failure path:
   - keep modal open
   - show inline error
   - preserve subject/body/attachments for retry

#### Interview Rejected Bulk Email End-to-End
1. Recruiter clicks `Send Bulk Email to Rejected Candidates`.
2. Controller derives recipients from in-memory scoped list:
   status == `Interview Rejected` only.
3. Explicit exclusion enforced for `Resume Rejected`.
4. If none, button disabled with tooltip.
5. If recipients exist, modal opens showing recipient count.
6. Recruiter composes subject/body, adds attachments.
7. Send lifecycle mirrors shortlisted flow (validation, loading, send,
   success/error handling).

### Loading States

- Candidate list fetch in progress:
  - table skeleton/spinner shown
  - search/filter/buttons/pagination disabled
  - no stale rows rendered
- Email send in progress:
  - send button shows loading state
  - submit action locked to prevent double send
  - compose inputs may remain visible but submission controls are guarded
- Attachment upload in progress:
  - per-file upload progress/processing indicator
  - failed files are flagged without wiping valid draft data

### Error States and Recovery

- Candidate fetch failure:
  - inline error message
  - retry action re-triggers scoped fetch
- Attachment upload failure:
  - file-level error message
  - remove/retry failed file supported
  - existing subject/body and other files preserved
- Email send failure:
  - modal-level inline error
  - modal remains open
  - all draft fields preserved
  - recruiter can retry send without retyping

### Edge Cases

- No candidates for this job posting:
  - render empty state: no candidates yet for this role
- Candidates exist, but search/filter yields none:
  - render contextual empty state: no matches for current criteria
- No shortlisted candidates:
  - shortlisted bulk button disabled with required tooltip
- No interview rejected candidates:
  - rejected bulk button disabled with required tooltip
- Email send fails mid-flight:
  - preserve draft and attachments where possible
  - expose retry path in same modal
- Attachment upload failure:
  - isolate failed file, do not lose entire draft

### Step-by-Step Recruiter Interaction Walkthrough

#### Walkthrough A: Email Shortlisted Candidates
1. Recruiter opens a job detail page by clicking `View` from Jobs list.
2. Scrolls below `Scoring Weights` to Candidate Management Table.
3. Optionally narrows candidates via search/filter.
4. Clicks `Send Bulk Email to Shortlisted Candidates`.
5. Confirms recipient count shown in modal.
6. Writes subject/body and adds optional attachments.
7. Clicks `Send`.
8. Sees loading.
9. On success, sees confirmation and modal closes; on failure, error appears
   and draft remains for retry.

#### Walkthrough B: Email Interview Rejected Candidates
1. Recruiter opens same section on the same job detail page.
2. Optionally uses search/filter for visibility (recipient logic remains status
   constrained).
3. Clicks `Send Bulk Email to Rejected Candidates`.
4. Confirms recipient count for `Interview Rejected` candidates only.
5. Writes subject/body and adds optional attachments.
6. Clicks `Send`.
7. Sees loading.
8. On success, receives success notification and modal closes; on failure,
   modal remains open with preserved content for retry.

### Functional Requirements

- **FR-001**: System MUST allow admins to create hiring posts with job
  details, screening configuration, interview configuration, and publish
  settings.
- **FR-002**: System MUST auto-transition hiring posts from Published to
  Closed when the deadline passes.
- **FR-003**: System MUST generate a unique, shareable application link
  for each published hiring post.
- **FR-004**: System MUST accept candidate applications with basic details,
  profile photo, and resume upload (PDF/DOCX, max 5MB) without requiring
  login.
- **FR-005**: System MUST send a confirmation email to candidates upon
  successful application.
- **FR-006**: System MUST parse uploaded resumes into structured markdown
  and normalized fields using LLM-based extraction.
- **FR-007**: System MUST score each candidate against the JD using three
  layers: embedding similarity, LLM skill match, LLM experience match,
  and LLM culture match.
- **FR-008**: System MUST compute a weighted overall score using
  admin-configured weights.
- **FR-009**: System MUST auto-advance candidates scoring above the
  threshold to interview and auto-reject or flag candidates below.
- **FR-010**: System MUST send interview invitation emails to auto-advanced
  candidates with a time window and portal link.
- **FR-011**: System MUST authenticate candidates on the portal via email
  + OTP with rate limiting (max 3 attempts, 10-minute expiry).
- **FR-012**: System MUST conduct real-time voice interviews using a
  STT → LLM → TTS pipeline with dynamic question generation.
- **FR-013**: System MUST generate interview questions dynamically based
  on the candidate's resume and JD, split between foundational and
  project-based tracks.
- **FR-014**: System MUST enforce session boundaries: max questions, max
  duration, and time window expiry.
- **FR-015**: System MUST record full interview audio and generate a
  timestamped transcript.
- **FR-016**: System MUST evaluate each interview answer on four
  dimensions: technical accuracy, depth of understanding, communication
  clarity, and relevance to JD.
- **FR-017**: System MUST produce an interview report with overall grade,
  per-question breakdown, transcript, audio playback, and AI summary.
- **FR-018**: System MUST display a standardized candidate table with
  sorting, filtering, searching, and bulk actions.
- **FR-019**: System MUST support side-by-side comparison of 2-4
  candidates with radar charts, skill overlap, and experience timelines.
- **FR-020**: System MUST provide analytics with funnel visualization,
  conversion rates, timing metrics, and CSV/PDF export.
- **FR-021**: System MUST support role-based access control: admin
  (full access), recruiter (assigned jobs), hiring manager (view-only
  reports), candidate (self-service portal).
- **FR-022**: System MUST enforce data retention policies with
  configurable auto-deletion timelines.
- **FR-023**: System MUST log explicit candidate consent before AI
  interview with timestamp for audit.
- **FR-024**: System MUST detect duplicate applications by email and
  prevent re-submission to the same post.
- **FR-025**: System MUST allow candidates to reconnect to a disconnected
  interview session within 5 minutes.
- **FR-026**: System MUST support interview template management: create,
  edit, clone, configure question count, duration, track split, scoring
  weights, and must-ask topics.
- **FR-027**: System MUST provide real-time candidate status tracking on
  the candidate portal with email notifications at each status change.

### Key Entities

- **Hiring Post**: A job listing with details, screening config, interview
  config, publish schedule, and state (Draft/Published/Closed/Archived).
  Owned by an organization, created by an admin.
- **Candidate**: A person who applies to a hiring post. Has basic details,
  profile photo, parsed resume, scores, interview data, and status.
  Linked to one or more hiring posts via applications.
- **Application**: Links a candidate to a hiring post. Contains the
  uploaded resume, parsed data, scores, and status progression.
- **Interview Session**: A voice conversation between a candidate and the
  AI interviewer. Contains audio recording, transcript, question-answer
  pairs, and evaluation scores. Linked to an application.
- **Interview Template**: Configurable blueprint for interviews. Defines
  question count, duration, track split, scoring weights, and must-ask
  topics. Reusable across hiring posts.
- **Organization**: The hiring company. Contains team members, settings,
  email templates, and default configurations.
- **Team Member**: A user within an organization with a role (admin,
  recruiter, hiring manager) and job assignments.
- **Interview Report**: The evaluated output of an interview session.
  Contains per-answer scores, overall grade, AI summary, and
  recommendation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A recruiter can go from creating a hiring post to having a
  ranked candidate table with scores within 24 hours of receiving the
  first application (assuming at least 10 applicants).
- **SC-002**: 95% of resumes are parsed and scored within 5 minutes of
  submission.
- **SC-003**: Candidates experience less than 2 seconds of response
  latency during AI voice interviews.
- **SC-004**: Recruiters spend less than 5 minutes per candidate reviewing
  interview reports to make a shortlist decision (compared to 30-60
  minutes for a live first-round interview).
- **SC-005**: 90% of candidates who start an AI interview complete it
  without disconnection or technical failure.
- **SC-006**: The system supports at least 50 concurrent candidate
  applications being screened simultaneously.
- **SC-007**: Candidate portal loads and displays current status within
  3 seconds of authentication.
- **SC-008**: Analytics funnel data refreshes within 1 minute of a
  candidate status change.
- **SC-009**: Candidates complete the application form in under 3 minutes.
- **SC-010**: Interview evaluation and report generation completes within
  10 minutes of the interview ending.

## Assumptions

- Admins and recruiters have stable internet connectivity and use modern
  browsers (Chrome, Firefox, Safari, Edge — latest 2 versions).
- Candidates have access to a device with a microphone and a stable
  internet connection for the voice interview.
- The organization has API access to at least one LLM provider (e.g.,
  Claude, GPT) and one each of STT (e.g., Deepgram) and TTS (e.g.,
  ElevenLabs) services.
- Supabase handles authentication (admin side), file storage, and database
  with Row Level Security enabled.
- Email delivery (confirmation, invitation, notifications) is handled via
  a transactional email service (e.g., Resend, SendGrid) integrated with
  the backend.
- SMS notifications are out of scope for Phase 1; email is the primary
  notification channel.
- Bias monitoring and audit reports are tracked via scoring logs but
  formal bias detection algorithms are out of scope for Phase 1.
- The platform serves English-language interviews and resumes in Phase 1.
  Multi-language support is a future enhancement.
- Shareable report links for hiring managers are time-limited (e.g., 7
  days) and do not require authentication.


## AI Interview Summary *(mandatory)*

This section defines the AI-generated interview summary feature that appears in the candidate interview view, providing recruiters with a quick, comprehensive overview of the interview session.

### Feature Overview

The AI Interview Summary is an automatically generated summary of a candidate's interview session that appears at the top of the interview view, above the existing transcript. It provides recruiters with a quick understanding of the candidate's performance without requiring them to read the entire transcript.

**Purpose:**
- Accelerate recruiter decision-making by providing key insights at a glance
- Highlight strengths, concerns, and notable moments from the interview
- Provide an overall recommendation sentiment to guide next steps

**Scope Boundaries:**
- This is a strictly additive feature
- No existing UI elements, routes, or components are modified
- The summary appears above the transcript without altering transcript display
- Summary generation occurs on-demand when the interview view is opened

### Exact Location and Placement

**Page Context:**
- Route: `/recruiter/candidates/[candidateId]/interview` (or similar interview detail route)
- Triggered by: Clicking on a candidate row in the Candidates table
- Current view: Shows interview transcript for the selected candidate

**Placement:**
- The AI Interview Summary card appears **at the very top** of the interview view
- Positioned **directly above** the existing interview transcript
- No other UI elements are moved, reordered, or modified
- The transcript remains in its current position and styling

**Visual Hierarchy:**
```
┌─────────────────────────────────────────────────────────┐
│ AI Interview Summary                                    │
│ [Summary content generated by LLM]                      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Interview Transcript (existing, unchanged)              │
│ [Existing transcript display]                           │
└─────────────────────────────────────────────────────────┘
```

### UI Structure and Layout

**Summary Card:**
- **Title**: "AI Interview Summary" (clear, prominent heading)
- **Container**: Card or panel with subtle background color (e.g., light blue/gray tint)
- **Border**: Subtle border to visually distinguish from transcript
- **Padding**: Adequate spacing (16-24px) for readability
- **Typography**: 
  - Title: Bold, slightly larger than body text
  - Content: Regular weight, comfortable line height (1.6-1.8)
  - Sections: Use bold labels for each summary section

**Loading State:**
- Display skeleton loader or spinner while summary is being generated
- Show text: "Generating AI summary..." or similar
- Disable any interactive elements during loading
- Loading indicator should be visually centered in the summary card area

**Error State:**
- If summary generation fails, show error message in the summary card
- Message: "Unable to generate summary. Please try again later."
- Optionally include a "Retry" button
- Do not block access to the transcript if summary fails

**Empty State:**
- If no transcript exists (interview not completed), show message:
  "Interview summary will be available after the interview is completed."

### Summary Content Requirements

The AI summary is generated by passing the full interview transcript to an LLM with a structured prompt. The summary must include the following sections:

**1. Overall Performance (2-3 sentences)**
- High-level assessment of the candidate's interview performance
- General impression of communication skills and engagement
- Overall readiness for the role

**2. Key Strengths (3-5 bullet points)**
- Technical skills demonstrated effectively
- Strong answers or impressive knowledge areas
- Positive behavioral indicators (e.g., problem-solving approach, enthusiasm)

**3. Areas of Concern (2-4 bullet points)**
- Knowledge gaps or weak responses
- Communication issues or unclear explanations
- Red flags or concerns that need follow-up

**4. Notable Responses (2-3 bullet points)**
- Standout answers (positive or negative)
- Unique insights or approaches mentioned by the candidate
- Memorable moments that distinguish this candidate

**5. Overall Recommendation (1-2 sentences)**
- Clear sentiment: "Strong Recommend" / "Recommend with Reservations" / "Do Not Recommend"
- Brief justification for the recommendation
- Suggested next steps (e.g., "Advance to technical round" / "Needs further evaluation")

### LLM Prompt Structure

**System Prompt:**
```
You are an expert technical recruiter analyzing interview transcripts. Your task is to provide a comprehensive, objective summary of the candidate's interview performance. Focus on technical accuracy, communication clarity, problem-solving ability, and cultural fit indicators.

Be honest and balanced in your assessment. Highlight both strengths and weaknesses. Your summary will help recruiters make informed decisions about advancing candidates.
```

**User Prompt Template:**
```
Analyze the following interview transcript and provide a comprehensive summary.

Job Title: {job_title}
Candidate Name: {candidate_name}

Interview Transcript:
{full_transcript}

Provide a structured summary with the following sections:

1. Overall Performance: A 2-3 sentence high-level assessment
2. Key Strengths: 3-5 bullet points of demonstrated strengths
3. Areas of Concern: 2-4 bullet points of weaknesses or gaps
4. Notable Responses: 2-3 bullet points of standout moments
5. Overall Recommendation: Clear sentiment (Strong Recommend / Recommend with Reservations / Do Not Recommend) with brief justification

Format your response in markdown with clear section headers.
```

**LLM Configuration:**
- Model: GPT-4 or Claude (whichever is configured for the platform)
- Temperature: 0.3 (lower temperature for more consistent, objective summaries)
- Max tokens: 800-1000 (sufficient for comprehensive summary)
- Response format: Markdown text

### API Endpoint Specification

**Endpoint:** `GET /api/v1/interview/{session_id}/summary`

**Path Parameters:**
- `session_id` (string, required): The unique identifier of the interview session

**Response (Success - 200 OK):**
```json
{
  "session_id": "uuid",
  "summary": "markdown-formatted summary text",
  "generated_at": "2026-05-08T10:30:00Z",
  "model_used": "gpt-4"
}
```

**Response (Error - 404 Not Found):**
```json
{
  "detail": "Interview session not found"
}
```

**Response (Error - 400 Bad Request):**
```json
{
  "detail": "Interview not completed - transcript not available"
}
```

**Response (Error - 500 Internal Server Error):**
```json
{
  "detail": "Failed to generate summary"
}
```

**Behavior:**
- Summary is generated on-demand when the endpoint is called
- No caching or persistence required (generate fresh each time)
- If transcript is empty or interview not completed, return 400 error
- If LLM call fails, return 500 error with appropriate message

### State Management

**Frontend State Variables:**
```typescript
{
  // Summary state
  summary: string | null,              // The generated summary markdown
  isSummaryLoading: boolean,           // Loading state during generation
  summaryError: string | null,         // Error message if generation fails
  
  // Existing state (unchanged)
  transcript: string,                  // Existing transcript data
  // ... other existing state variables
}
```

**State Flow:**
1. Component mounts → Set `isSummaryLoading = true`
2. Fetch summary from API → `GET /api/v1/interview/{session_id}/summary`
3. On success → Set `summary = response.summary`, `isSummaryLoading = false`
4. On error → Set `summaryError = error.message`, `isSummaryLoading = false`
5. Render summary card with appropriate state (loading / content / error)

**State Ownership:**
- Summary state is owned by the interview view component
- No global state or context required
- Summary is fetched independently of transcript data
- Transcript loading and display logic remain unchanged

### Loading States and Error Handling

**Loading State:**
- Display immediately when component mounts
- Show skeleton loader or spinner in summary card area
- Text: "Generating AI summary..."
- Duration: Typically 2-5 seconds (LLM response time)
- Transcript remains visible and accessible during loading

**Success State:**
- Display summary markdown in the card
- Summary is formatted with proper headings and bullet points
- Sections are clearly delineated
- Recommendation sentiment is visually highlighted (e.g., color-coded badge)

**Error State:**
- Display error message in summary card
- Message: "Unable to generate summary. Please try again later."
- Optionally include "Retry" button to re-fetch
- Error does not block access to transcript
- Log error details to console for debugging

**Empty State (No Transcript):**
- Display message: "Interview summary will be available after the interview is completed."
- Show placeholder card with muted styling
- Do not attempt to call the API if interview status is not "completed"

### Architectural Constraints

**Additive Only - No Modifications:**
- Do NOT modify existing interview view components
- Do NOT change transcript display, styling, or layout
- Do NOT alter routing or navigation logic
- Do NOT modify candidate table or any other views
- Do NOT change database schema or add new tables
- Do NOT modify existing API endpoints

**What Can Be Added:**
- New summary card component (above transcript)
- New API endpoint: `GET /api/v1/interview/{session_id}/summary`
- New state variables for summary (loading, content, error)
- New LLM service function for summary generation
- New frontend utility for rendering markdown summary

**Separation of Concerns:**
- Summary generation logic lives in a dedicated service function
- Summary UI component is self-contained and independent
- Summary state does not interfere with transcript state
- API call for summary is separate from transcript data fetching

### Implementation Checklist

**Backend:**
- [ ] Create new API endpoint: `GET /api/v1/interview/{session_id}/summary`
- [ ] Implement LLM summary generation function
- [ ] Fetch interview transcript from database
- [ ] Pass transcript to LLM with structured prompt
- [ ] Return formatted summary in API response
- [ ] Handle errors (session not found, transcript empty, LLM failure)

**Frontend:**
- [ ] Add summary state variables to interview view component
- [ ] Fetch summary on component mount
- [ ] Create summary card component with title and styling
- [ ] Implement loading state (skeleton/spinner)
- [ ] Implement error state with message
- [ ] Implement empty state for incomplete interviews
- [ ] Render summary markdown with proper formatting
- [ ] Position summary card above transcript
- [ ] Ensure transcript display remains unchanged

**Testing:**
- [ ] Test summary generation with various transcript lengths
- [ ] Test loading state displays correctly
- [ ] Test error handling (API failure, empty transcript)
- [ ] Test empty state for incomplete interviews
- [ ] Verify summary appears above transcript
- [ ] Verify transcript display is unaffected
- [ ] Test on different screen sizes (responsive)

### Edge Cases

**No Transcript Available:**
- If interview status is not "completed", do not call the API
- Show empty state message in summary card
- Allow recruiter to view interview details without summary

**Very Short Transcript:**
- If transcript is < 100 words, summary may be brief
- LLM should still provide structured output with all sections
- Some sections may have fewer bullet points

**Very Long Transcript:**
- If transcript exceeds LLM context window, truncate intelligently
- Prioritize keeping complete Q&A pairs rather than cutting mid-answer
- Add note in summary: "Summary based on first N questions due to length"

**LLM API Failure:**
- Display error message in summary card
- Log error details for debugging
- Provide "Retry" button for user to attempt again
- Do not block access to transcript

**Slow LLM Response:**
- Show loading state for up to 30 seconds
- If response takes > 30 seconds, show timeout error
- Allow user to retry or proceed without summary

**Multiple Recruiters Viewing Same Interview:**
- Each recruiter generates their own summary (no caching)
- Summaries may vary slightly due to LLM non-determinism
- This is acceptable and does not require synchronization

### Success Criteria

**Functional:**
- Summary generates successfully for completed interviews
- Summary appears above transcript in correct position
- Loading state displays during generation
- Error states handle gracefully without blocking transcript access
- Summary content includes all required sections

**Performance:**
- Summary generation completes within 5 seconds (typical)
- Loading state provides clear feedback to user
- Page remains responsive during summary generation
- Transcript loads independently of summary

**User Experience:**
- Summary is visually distinct from transcript
- Content is readable and well-formatted
- Recommendation sentiment is clear and actionable
- Recruiters can quickly assess candidate without reading full transcript
- Error messages are helpful and non-blocking

**Non-Regression:**
- Existing interview view functionality unchanged
- Transcript display, styling, and behavior preserved
- Navigation and routing work as before
- No impact on other parts of the application

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

## Requirements *(mandatory)*

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

# int.ai — What Was Built, Fixed, and What's Next

---

## Overview

The live int.ai codebase was cloned into a local environment to diagnose, fix, and test a set of issues before they went any further. Over the course of this work, several bugs were resolved, a few missing backend features were built out, and the scoring system was improved to make candidate evaluations more accurate and fair.

Everything here has been tested and is working correctly locally. **None of this is live yet** — it all needs to be merged into the production repo for the changes to appear on the actual site.

---

## The Candidate Scoring System — What It Is and Why It Works This Way

This is probably the most important thing to understand about how int.ai evaluates candidates, because it shapes everything the recruiter sees in the candidates table.

When a candidate submits a resume, the platform doesn't just keyword-search it. It runs four independent evaluations in parallel, each measuring something different, and then combines them into a single overall score. Here's what each one means and why it exists:

### Embedding Similarity
This is a semantic similarity score — it measures how closely the candidate's resume, taken as a whole, resembles the job description. It's not looking for specific words; it's looking at meaning. Two documents that use completely different vocabulary but talk about the same things will score high here. This exists because keyword matching alone misses candidates who describe the same experience in different terms.

### Skill Match
This looks at the specific skills listed in the job requirements and checks whether the candidate demonstrates them — either explicitly (they listed the skill) or implicitly (they used tools or frameworks that require the skill). For example, if the job requires "Object-Oriented Programming" and the candidate lists Django, Flask, or any Python framework, that counts — because you cannot build with those frameworks without applying OOP. This implicit inference was something that was broken and has been fixed (more on that below).

The scoring uses confidence bands:
- **0.8–1.0** — skill is explicitly mentioned
- **0.5–0.75** — skill is clearly implied through tools or frameworks
- **0.2–0.49** — weak inference, skill is probably there
- A skill is counted as matched when confidence is 0.4 or above

### Experience Match
This evaluates whether the depth and nature of the candidate's experience aligns with what the role needs. A junior developer applying for a senior role will score low here even if their skills match. It's measuring seniority, relevance of past work, and domain fit — not just years on paper.

### Culture Match
This looks at how the candidate describes their work style, values, and approach — and how that fits the tone and expectations laid out in the job description. It's a softer signal but matters especially for roles where team fit is important.

### Overall Score
The four scores above are combined using a weighted formula. The weights can be configured per job post — for a highly technical role you might weight skill match heavily, while for a leadership role culture match might matter more. The overall score is what appears in the candidates table and drives the auto-advance logic.

### Auto-Advance Logic
Once the overall score is computed, the platform takes action automatically:
- **Score at or above the threshold** → candidate is advanced to interview, an interview session is created, and an invitation email is sent
- **Score well below the threshold** → candidate is rejected and a rejection email is sent
- **Score in the middle** → flagged for human review, no automated action

The threshold is set per job post, so different roles can have different bars.

---

## Features Built

### Voice AI Interview with Question Limits
The interview module uses a LiveKit-powered voice agent backed by GPT-4o-mini and Deepgram for speech-to-text and text-to-speech. Recruiters can configure how many questions the AI should ask (via the interview template). The system now strictly enforces this limit — the AI is told the exact count in its instructions, and there's a hard code-level guard that ignores any candidate responses beyond the limit even if the AI tries to go further.

Each Q&A pair is recorded in the database as the interview progresses, so post-interview evaluation has the full transcript to work with.

### Post-Interview Evaluation
After an interview session completes, the recorded Q&A pairs are evaluated by the AI against the job description and resume. Each answer is scored across multiple dimensions and an overall recommendation is generated (Strong Yes / Yes / Maybe / No). This feeds into the interview report that recruiters see on the candidate detail page.

### Resume Parsing and Structured Data
Beyond scoring, the resume is also parsed into structured fields — name, email, education, work experience, skills, projects, certifications, and a summary. These fields power the popovers and detail views in the candidate profile. Parsing runs in parallel with scoring so it doesn't slow down the pipeline.

### Team Invitations
Admins can invite team members from the Settings page. When an invitation is sent, the backend creates the appropriate record and sends an email via Resend. This was wired up end-to-end.

### Score Override
Recruiters can override a candidate's AI-generated score and add notes from the candidate detail page. This allows human judgment to correct or supplement the AI evaluation when needed.

### Score Details / Fit Analysis Page
On the candidate detail page, there is now a "View Score Details →" button in the top right of the screening scores card. Clicking it opens a dedicated fit analysis page that didn't exist in the original version at all.

This page shows the recruiter exactly *why* a candidate scored what they scored — not just the numbers. It's split into two panels side by side:

**Left panel — full score breakdown:**
- All five scores at a glance (embedding, skill, experience, culture, overall)
- Skill match: every required skill listed individually with a matched / not matched indicator, a confidence percentage, and the exact evidence from the resume that justified it
- Experience match: broken into four sub-dimensions — Seniority Alignment, Years of Experience, Project Complexity, and Domain Relevance — each with its own score bar and AI reasoning
- Culture match: broken into Collaboration Signals, Communication Style, and Initiative Indicators — same format

**Right panel — the resume itself:**
- The full resume displayed in a sticky scrollable panel
- When a recruiter hovers over any skill, experience dimension, or culture signal on the left, the resume panel automatically scrolls to and highlights the exact sentence the AI used as evidence for that score
- A recruiter can instantly see "the AI gave Python 95% confidence because of *this exact line* in the resume"

There is also a re-screen button for candidates who were processed before evidence tracking was added — it triggers a fresh screening run so hover-to-highlight works for them too.

In Version B, none of this existed. The candidate page showed four percentage numbers in a grid with no explanation of what drove them.

---

## Bugs Fixed

### Resume Screening Was Crashing on Every Single Run
This was the biggest issue and was completely silent — no error shown, candidates just stayed stuck. The pipeline was trying to write a database record before it had the data ready, the database rejected it, and the whole screening job crashed. The fix was straightforward once identified: include the resume text in the initial record, not a later update. A database migration was also written to relax the constraint as a safety net.

### Skills Like OOP Being Marked "Not Found"
The skill scoring was too literal. A candidate who built projects in Django, Flask, or FastAPI would get 0% for Object-Oriented Programming because they didn't write those exact words. The scoring AI was rewritten to understand that using a framework implies knowing the underlying concept — OOP through Django, Python proficiency through TensorFlow, and so on. This made a meaningful difference in how candidates are evaluated.

### AI Interviewer Going Over the Question Limit
If a session was configured for 5 questions, the interviewer would sometimes ask 6 or 7 before closing. The AI wasn't explicitly told its limit in its instructions, so it was estimating based on context. Fixed by injecting the exact number into the system prompt and adding a hard code-level stop that kicks in after the last answer regardless of what the AI does next.

### Interview Page Showing "Failed to Start Interview"
Every candidate who tried to join an interview was hitting this error. The frontend was calling the wrong URL paths on the backend — missing a `/v1` segment that's required for the API to route correctly. A small but completely blocking bug. Fixed across all affected pages.

### Any Logged-In User Could Access the Admin Dashboard
The recruiter dashboard only checked if someone was logged in, not who they were. A candidate who created an account could navigate directly to `/dashboard` and see all recruiter data. Fixed by adding a role check — only users with `admin`, `recruiter`, or `hiring_manager` roles in the team_members table can access admin routes.

### Crash When a Candidate Refreshed During an Interview
If someone refreshed the page mid-interview, the backend would try to create a second interview session for them and crash because one already existed. Fixed by detecting in-progress sessions and returning them for rejoin instead of trying to create a new one.

### Team Invitations and Score Overrides Were Not Connected
The buttons existed in the UI but the backend endpoints hadn't been built yet, so every action silently failed. Both endpoints were implemented and wired up.

### Recent Fixes (April 29, 2026)

#### Issue 1 — Interviewer Responding Too Fast / Cutting Off the Candidate
The interviewer was treating even the briefest pause mid-sentence as "the candidate is done." Fixed by giving the system more breathing room: it now waits significantly longer after you go quiet before deciding your answer is complete. You can pause mid-thought without triggering an early response.

#### Issue 2 — Interviewer Appeared to Stop and Listen While Still Speaking
When you made any sound, the screen would flip to "Listening..." even though the interviewer's voice was still playing. This made it look (and feel) like you were interrupting them. Fixed by monitoring the actual audio signal — the screen now only shows "Listening..." and starts the 15-second countdown once the interviewer's voice has genuinely gone silent, not just when the backend says it's done thinking.

#### Issue 3 — Interviewer Asked More Questions Than It Should
The AI was sometimes starting to generate an extra question even while it was supposed to be wrapping up the interview. Fixed by blocking the AI from producing any new question the moment the final answer is recorded — the closing message now plays reliably without an extra question slipping through.

#### Issue 4 — Test Candidate Still Appearing
The test account (team@nunnarilabs.com) and all its data were fully deleted from the system — the interview records, application, candidate profile, and auth account.

#### Issue 5 — Interviewer Freezes Between Questions (FIXED April 29, 2026)
After fixes 1–4, a regression was introduced: the interviewer would freeze and not accept voice input between questions. The candidate could hear the question, but the microphone wouldn't listen.

**Root cause**: The combination of three timing parameters created a state where the audio capture stream wasn't properly reinitializing between turns:
- `endpointing_ms=1200` (from Issue 1): Deepgram waits 1.2s of silence before finalizing speech
- `turn_handling.endpointing.min_delay=2.5`: LiveKit waits an additional 2.5s after Deepgram fires
- Combined total: ~3.7s of required silence, but more importantly, this long delay combined with the `discard_audio_if_uninterruptible=True` flag meant the VAD (Voice Activity Detection) and STT stream weren't being reset properly after each turn committed.

**Fix applied**:
1. **Backend (agent.py)**: Reduced `min_delay` from 2.5s to 1.5s (total silence required drops to ~2.7s, still enough for mid-thought pauses). Added `max_delay=5.0` to force turn commitment after 5s if Deepgram is slow to finalize, preventing infinite hangs.
2. **Frontend (interview-room.tsx)**: Added explicit microphone re-enable when `question_progress` is received. This ensures the audio input stream is active whenever a new question is about to be asked.
3. **Backend (entrypoint.py)**: Improved debug logging and null-check logic in the `conversation_item_added` handler to track state transitions more clearly and prevent edge cases where responses get dropped.

The 1200ms endpointing is preserved (fixing Issue 1), but by reducing the turn commitment delay and re-enabling the microphone explicitly, the audio stream now properly reinitializes between questions. Candidates can still pause mid-answer without being cut off, and the microphone remains responsive throughout the interview.

---

## How It Was Tested

Two simulation scripts were written to test the core flows without needing real external services:

**Interview simulation** (`simulate_interview.py`) — Runs the exact event-handling logic from the voice interview agent entirely in-process, no LiveKit or audio needed. Covers 10 test cases: exact question count, sequential numbering, guard blocking extra turns, closing message firing once, session-end signal published, shutdown event set, progress events, system prompt containing the limit, and edge cases like a 1-question interview. All 10 passed.

**End-to-end pipeline simulation** (`simulate_e2e.py`) — Runs the full hiring pipeline against a real Supabase test database with AI services mocked. Creates a candidate, submits an application, runs resume screening, verifies interview session creation, simulates a full Q&A interview, triggers evaluation, and verifies the question limit holds. All test data is cleaned up after. 19 of 19 checks passed.

---

## Current Status and Next Steps

Everything above is local. The live site is running the original code with none of these changes applied.

To go live:

1. **Merge this code into the production GitHub repo and push** — triggers a redeployment
2. **Run this SQL in the Supabase dashboard** (required for resume screening to work):
   ```sql
   ALTER TABLE resume_data ALTER COLUMN raw_markdown DROP NOT NULL;
   ```
3. **Rotate all API keys** (Supabase, OpenAI, Deepgram, LiveKit, Resend) — these were present in the local config files and should be cycled as a precaution before going further
4. **Set `NEXT_PUBLIC_BACKEND_URL`** in the production hosting environment (Vercel/Render) — without this, the frontend falls back to `localhost:8000` and all API calls fail silently on the live site

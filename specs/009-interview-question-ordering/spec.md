# Feature Specification: Interview Question Ordering

**Feature Branch**: `009-interview-question-ordering`
**Created**: 2026-10-20
**Status**: Implemented
**Input**: Resume-anchored project questions (planned in CLAUDE.md as being asked "at the appropriate point in the ratio-controlled question flow") are asked back to back straight after the recruiter's custom questions, one per resume project, ignoring `foundational_ratio` (`backend/app/interview/question_gen.py`). A resume with many projects can fill the whole interview with project questions and leave no foundational ones.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Project Questions Are Spread Through the Interview (Priority: P1)

A candidate whose resume lists several projects is asked about a few of them by
name, mixed in with foundational questions, in proportion to the job's
`foundational_ratio`.

**Acceptance Scenarios**:
1. **Given** `max_questions = 10`, `foundational_ratio = 0.6`, 2 custom questions and 6 named projects, **When** the interview runs, **Then** the question types in order are custom, custom, then for the 8 remaining slots: generated, project, generated, project, generated, generated, project, generated (3 anchored project questions).
2. **Given** `max_questions = 10`, `foundational_ratio = 0.6`, no custom questions and 1 named project, **When** the interview runs, **Then** exactly 1 anchored project question is asked, at slot 2, and every other slot is generated.
3. **Given** no named projects, **When** the interview runs, **Then** custom questions come first and every remaining slot is generated, as today.
4. **Given** custom questions numbering `max_questions` or more, **When** the interview runs, **Then** no anchored project question is asked.
5. **Given** anchored question generation fails for a project, **When** that slot is reached, **Then** a generated question is asked instead and the project stays queued for the next due slot, as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `QuestionGenerator` MUST receive `max_questions` (from the interview template, passed by `_SessionController`).
- **FR-002**: Recruiter custom questions MUST still be asked first, in order, unchanged.
- **FR-003**: After the custom questions, the remaining slots are `open = max(max_questions - custom_count, 0)`, and the project share is `share = 1 - foundational_ratio`, clamped to 0–1 and computed exactly (not in floating point). A NULL `foundational_ratio` is treated as the column default 0.6. At most `cap = floor(open × share + 0.5)` anchored project questions are asked per interview.
- **FR-004**: At the k-th open slot (k = 1, 2, …), an anchored project question is asked only when a named project remains, fewer than `cap` have been asked, and fewer than `floor(k × share + 0.5)` have been asked. Otherwise the slot gets an LLM-generated question.
- **FR-005**: An open slot is counted only when a question is actually returned. A failed generation that raises does not advance the count.
- **FR-006**: The total number of questions, the closing condition (`current_q >= max_questions`), the anchored-question prompt, the `resume_project` question type and the LLM generation prompt MUST stay unchanged.

## Success Criteria *(mandatory)*

- **SC-001**: Backend tests cover acceptance scenarios 1–5 with the LLM mocked, and the full backend suite passes.
- **SC-002**: No migration, frontend or API change.

## Assumptions

- `foundational_ratio` comes from the template config (default 0.6), and its meaning "share of foundational questions" now also bounds anchored project questions.
- LLM-generated questions may themselves be "project" deep-dives (the generation prompt asks for the ratio). That mix is unchanged.

## Out of Scope

- Choosing which projects to ask about (they are taken in resume order).
- Changing how the LLM-generated questions balance foundational and project topics.

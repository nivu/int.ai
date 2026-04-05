<!--
Sync Impact Report
===================
Version change: 0.0.0 -> 1.0.0 (MAJOR - initial ratification)
Modified principles: N/A (first version)
Added sections:
  - Core Principles (5 principles)
  - Technology Constraints
  - Development Workflow
  - Governance
Removed sections: None
Templates requiring updates:
  - plan-template.md: OK (Constitution Check section aligns with principles)
  - spec-template.md: OK (security requirements, user scenarios compatible)
  - tasks-template.md: OK (security hardening phase present, structure compatible)
Follow-up TODOs: None
-->

# int.ai Constitution

## Core Principles

### I. Security-First (NON-NEGOTIABLE)

Every feature, endpoint, and data flow MUST be evaluated for security
implications before implementation begins. Specific requirements:

- All user input MUST be validated and sanitized at system boundaries
- Authentication and authorization MUST be enforced on every API route
- Secrets MUST NOT be committed to version control; use environment
  variables or a secrets manager
- Dependencies MUST be audited for known vulnerabilities before adoption
- Supabase Row Level Security (RLS) MUST be enabled on every table
- OWASP Top 10 vulnerabilities MUST be actively prevented

### II. Simplicity (YAGNI)

Build only what is needed now. Do not design for hypothetical future
requirements. Specific requirements:

- Every feature MUST trace back to a concrete user need
- No speculative abstractions, premature optimizations, or unused
  configurability
- Prefer standard library and framework capabilities over custom solutions
- Three similar lines of code are preferable to a premature abstraction
- If a dependency can be avoided with <50 lines of straightforward code,
  avoid it

### III. Data Integrity

User data is the most valuable asset. Protect it at every layer.
Specific requirements:

- Database migrations MUST be reversible
- All write operations MUST be transactional where consistency is required
- Supabase RLS policies MUST be tested before deployment
- Backups and recovery procedures MUST be documented before launch
- API responses MUST NOT leak internal IDs, stack traces, or system details

### IV. Clear Boundaries

The system is composed of three distinct layers: Next.js frontend,
Python backend, and Supabase data layer. Specific requirements:

- Frontend MUST NOT contain business logic; it calls backend APIs or
  Supabase client queries only
- Python backend MUST own all AI/ML processing and complex business logic
- Supabase MUST be the single source of truth for persistent data
- Each layer MUST be independently deployable
- API contracts between layers MUST be defined before implementation

### V. Observability

You cannot fix what you cannot see. Specific requirements:

- All API endpoints MUST log request metadata (method, path, status,
  duration) without logging sensitive data
- Errors MUST be captured with sufficient context for debugging
- AI model calls MUST log token usage and latency
- Structured logging (JSON) MUST be used in the Python backend

## Technology Constraints

- **Frontend**: Next.js (TypeScript, App Router)
- **Backend**: Python (FastAPI or equivalent)
- **Database/Auth**: Supabase (PostgreSQL + Auth + RLS)
- **AI**: Model provider TBD; all AI calls MUST be abstracted behind a
  service interface so the provider can be swapped
- **Deployment**: TBD; MUST support environment-based configuration
  (dev/staging/prod)

New dependencies MUST be justified with a concrete need. Prefer
well-maintained, widely-adopted packages.

## Development Workflow

- Features are developed on branches following the spec-kit flow:
  specify -> plan -> tasks -> implement
- Every PR MUST include a description of what changed and why
- Code review is required before merging to main
- No direct pushes to main
- Commits MUST be atomic and descriptive
- Tests MUST pass before merge (when tests exist for the affected area)

## Governance

This constitution is the highest-authority document for the int.ai
project. All implementation decisions MUST comply with these principles.

- **Amendments**: Any change to this constitution MUST be documented with
  rationale, reviewed, and versioned according to semver:
  - MAJOR: Principle removal or redefinition
  - MINOR: New principle or material expansion
  - PATCH: Clarifications and wording fixes
- **Compliance**: Every plan and PR MUST be checked against these
  principles before approval
- **Conflicts**: If a task conflicts with a principle, the principle wins.
  Exceptions MUST be documented in the plan's Complexity Tracking table
  with justification

**Version**: 1.0.0 | **Ratified**: 2026-04-05 | **Last Amended**: 2026-04-05

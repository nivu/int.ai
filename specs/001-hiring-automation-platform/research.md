# Research: AI-Powered Hiring Automation Platform

**Branch**: `001-hiring-automation-platform`
**Date**: 2026-04-05

## Voice Pipeline Architecture

### Decision: LiveKit Agents + Deepgram for STT/TTS

**Rationale**: LiveKit Agents SDK (Python) provides built-in WebRTC
transport, semantic turn detection, barge-in handling, and session
recording. Official `livekit-plugins-deepgram` eliminates custom
integration. Deepgram Nova-2 is optimized for Indian English with
sub-300ms STT latency.

**Alternatives considered**:
- Custom WebRTC + Deepgram direct: Too much infrastructure to maintain
  (STUN/TURN, session management, recording)
- Twilio Voice + OpenAI Realtime API: Higher latency, less control over
  turn detection, no Indian English optimization
- Daily.co + AssemblyAI: Smaller ecosystem, fewer Python agent frameworks

### Decision: VoicePipelineAgent (not custom agent)

**Rationale**: VoicePipelineAgent handles STT → LLM → TTS orchestration,
audio buffering, and pacing out of the box. Custom logic (dynamic question
generation, evaluation) plugs in via pipeline processors.

### Decision: Claude Sonnet for interview LLM

**Rationale**: Best latency-to-quality ratio for conversational follow-ups.
Streaming tokens → TTS minimizes perceived latency. Abstracted behind a
service interface per constitution (swappable to GPT-4o).

### Latency Budget (< 2 seconds target)

| Stage | Budget |
|-------|--------|
| Deepgram STT (streaming final) | 300-500ms |
| LLM first token (Claude Sonnet) | 400-600ms |
| TTS first audio (Deepgram) | 200-400ms |
| Network overhead | 100-200ms |
| **Total** | **1.0-1.7s** |

Key optimizations: stream LLM tokens to TTS concurrently, pre-generate
next question topics, LiveKit Cloud ap-south (Mumbai) for low RTT.

### Barge-In Handling

Set `allow_interruption=True` on VoicePipelineAgent. VAD detects speech
onset in <200ms, cancels ongoing TTS playback automatically. 300ms grace
window prevents false positives.

### Recording & Transcription

LiveKit Cloud records sessions natively to S3-compatible storage. Post-
session, Deepgram generates full transcript with timestamps asynchronously.
Store recording URL + transcript in Supabase.

### Python Packages

- `livekit-agents` — core orchestration
- `livekit-plugins-deepgram` — STT/TTS integration
- `livekit` — WebRTC client SDK
- `livekit-plugins-silero` — VAD fallback
- `openai` — OpenAI GPT-4o mini SDK

### Cost Estimate

- LiveKit Cloud: ~$0.03-0.09 per 30-min session
- Deepgram STT + TTS: ~$0.30-0.50 per session
- Claude Sonnet tokens: ~$0.50-1.00 per session
- **Total per interview: ~₹85-120 ($1.00-1.50)**

---

## Resume Screening Pipeline

### Decision: pdfplumber + python-docx for text extraction

**Rationale**: pdfplumber is fast with accurate table preservation.
python-docx handles DOCX natively. Avoids pymupdf licensing complexity.
Fallback to `unstructured` library for edge cases (scanned PDFs).

**Alternatives considered**:
- pymupdf (licensing concerns for commercial use)
- PyPDF2 (slower, less accurate)
- unstructured only (heavier dependency, overkill for most resumes)

### Decision: Local all-MiniLM-L6-v2 for embeddings

**Rationale**: 22M params, 384 dimensions. ~2ms per embedding locally.
No API latency or cost for 50 concurrent resumes. Semantic similarity
catches "React" = "React.js" = "ReactJS" automatically.

**Alternatives considered**:
- OpenAI embeddings API (adds latency + cost per resume)
- Voyage embeddings (better quality but API-dependent)
- all-mpnet-base-v2 (better quality, 4x slower — unnecessary for ranking)

### Decision: Store embeddings in Supabase pgvector

**Rationale**: Native PostgreSQL extension on Supabase. HNSW indexing for
fast similarity search. No need for a separate vector database. Resume
embedding stored alongside candidate data.

### Decision: JSON mode for LLM extraction

**Rationale**: Claude and GPT-4o support native JSON schema output.
Guaranteed valid structure. ~10-20% token savings over prompt engineering
alone. Function calling adds overhead.

### Decision: Celery + Redis for task queue

**Rationale**: 50 concurrent resumes cannot use FastAPI background tasks
(blocks worker threads). Celery provides job retry, priority queuing, and
horizontal scaling. ARQ is lighter but lacks Celery's maturity.

**Alternatives considered**:
- FastAPI BackgroundTasks (blocks at scale)
- ARQ (lighter, less mature ecosystem)
- Dramatiq (good but smaller community)

### Cost per Resume Screening

| Layer | Tokens | Cost |
|-------|--------|------|
| Resume parsing (to markdown) | 200-400 | ~$0.006 |
| Embedding similarity | 0 (local) | $0.00 |
| LLM skill match | 500-800 | ~$0.012 |
| LLM experience match | 600-1000 | ~$0.015 |
| LLM culture match | 400-600 | ~$0.009 |
| **Total** | **1700-2800** | **~$0.04** |

---

## Frontend & Auth Architecture

### Decision: @supabase/ssr for Next.js App Router

**Rationale**: Current standard, replaces deprecated @supabase/auth-helpers.
Designed for Server Components with proper cookie handling. Install:
`@supabase/ssr` + `@supabase/supabase-js`.

### Decision: Hybrid RBAC (roles table + JWT claims)

**Rationale**: Store roles in `user_roles` table (user_id, role, org_id).
Embed role in JWT custom claims via Supabase hook. RLS policies check
`auth.jwt()` — avoids extra table queries per request while maintaining
security.

### Decision: Supabase Realtime for live dashboard updates

**Rationale**: Realtime fully respects RLS policies. Use
`.on('postgres_changes')` for candidate status updates. Auth context
auto-applies RLS — recruiters only see their assigned jobs' candidates.

### Decision: Client-side direct upload to Supabase Storage

**Rationale**: Resumes/photos under 5MB are within Supabase's recommended
range. Signed URLs with token-based access control. Reduces backend load,
enables upload progress tracking in UI. Backend validates file type/size
via presigned URL generation.

### Decision: Supabase Auth native OTP for candidates

**Rationale**: Use `signInWithOtp()` — same auth system, different role.
Candidates get `candidate` role in JWT. RLS policies differentiate access.
No separate auth system needed.

### Decision: shadcn/ui + Recharts for dashboard UI

**Rationale**: shadcn/ui for form controls, tables, dialogs. Recharts for
charts (radar, funnel, timeline) — more flexible than Tremor, smaller
bundle. TanStack Table for advanced data table features.

**Alternatives considered**:
- Tremor (opinionated, less flexible for custom visualizations)
- Ant Design (heavy, React-specific design language)
- Material UI (heavy bundle, corporate look)

### Decision: Next.js route groups for dual experience

**Rationale**: App Router route groups cleanly separate admin and candidate:
- `app/(admin)/` — dashboard, jobs, candidates, analytics
- `app/(candidate)/` — portal, interview, status
- `app/auth/` — shared auth routes
- `middleware.ts` verifies roles on every request

---

## Deployment Architecture

### Decision: Vercel (frontend) + Railway/Fly.io (backend)

**Rationale**: Vercel is the native deployment target for Next.js.
Python backend needs a container host — Railway or Fly.io support FastAPI
with ap-south regions. LiveKit Cloud handles WebRTC infrastructure.

**Alternatives considered**:
- All-in-one on AWS (overkill for Phase 1, more ops burden)
- Render (less control over regions)
- Self-hosted (premature optimization per YAGNI principle)

### Decision: Redis Cloud for Celery broker + caching

**Rationale**: Required for Celery task queue. Also useful for interview
session state (FR-025 reconnection within 5 minutes) and OTP rate
limiting. Upstash Redis for serverless, or Redis Cloud for dedicated.

# Recruiter Platform — Architecture Diagram

## Full System Overview

```mermaid
flowchart TB
    subgraph RECRUITER["🧑‍💼 Recruiter Browser (Next.js Client)"]
        direction TB
        R1["Dashboard\n/dashboard"]
        R2["Jobs\n/jobs, /jobs/new, /jobs/[id]"]
        R3["Candidates\n/candidates, /candidates/[id]"]
        R4["Score Details\n/candidates/[id]/score-details"]
        R5["Interview Report\n(interview tab in candidate detail)"]
        R6["Templates\n/templates, /templates/[id]"]
        R7["Analytics\n/analytics"]
        R8["Settings\n/settings — team, scoring, retention"]
    end

    subgraph NEXTJS["⚙️ Next.js Server (Proxy Layer)"]
        P1["POST /api/proxy/[...path]\n(catch-all — forwards to backend)"]
        P2["POST /api/applications/submit"]
        P3["POST /api/email/application-confirmation"]
        P4["POST /api/screening/trigger"]
        P5["GET/POST /api/interview/*"]
    end

    subgraph BACKEND["🐍 FastAPI Backend"]
        direction TB
        A1["POST /api/applications/submit\nUpsert candidate · check dupe\ncreate application (status=applied)\nenqueue screen_resume_task"]
        A2["POST /api/jobs/generate-description\nGPT-4o-mini drafts JD from metadata"]
        A3["POST /api/screening/trigger\nenqueue screen_resume_task"]
        A4["POST /api/email/send\nsend templated email via Resend"]
        A5["POST /api/webhooks/application-created\ntrigger screening on DB insert event"]
        A6["POST /api/webhooks/application-status-changed\nfire email on status transition"]
        A7["POST /api/invitations/send\ninvite team member via email"]
        A8["POST /api/reports/[id]/override\nrecruiter overrides AI recommendation"]
    end

    subgraph QUEUE["🔁 Celery Task Queue (Redis broker)"]
        direction TB
        T1["screen_resume_task\n────────────────\n1. Download resume from Storage\n2. Extract text (PDF/DOCX)\n3. Parallel scoring (ThreadPoolExecutor)\n4. Compute overall_score\n5. Auto-advance / reject / flag\n6. Send candidate email"]
        T2["evaluate_interview_task\n────────────────\n1. Fetch session + QA records\n2. Score each dimension\n3. Generate interview_report\n4. Update application status\n5. Send outcome email"]
    end

    subgraph SCORING["🤖 Scoring Services (GPT-4o-mini)"]
        direction LR
        S1["Embedding Similarity\nresume ↔ JD vectors\ncosine similarity"]
        S2["Skill Match\nper required skill\nconfidence 0–1"]
        S3["Experience Match\nseniority · years\ncomplexity · domain"]
        S4["Culture Match\ncollaboration\ncommunication\ninitiative"]
        S5["Resume Parser\nname · email\nskills · experience\neducation · summary"]
    end

    subgraph EMAIL["📧 Email Service (Resend)"]
        E1["Application Confirmation"]
        E2["Interview Invitation + link + deadline"]
        E3["Rejection (resume)"]
        E4["Post-Interview Outcome\n(advance / borderline / reject)"]
        E5["Status Update (generic)"]
        E6["Team Member Invite"]
    end

    subgraph DB["🗄️ Supabase (PostgreSQL + pgvector)"]
        direction TB
        D1[("organizations\nid · name · settings\nscoring_weights · threshold\ndefault_template_id\ndata_retention_days")]
        D2[("team_members\norg_id · user_id · role\nstatus (invited/active/deactivated)")]
        D3[("hiring_posts\norg_id · title · department\nlocation · description\nrequired_skills[]\nexperience_min/max\nscoring_weights · threshold\ninterview_template_id\nstatus · share_slug\npublished_at · closes_at")]
        D4[("candidates\nemail (unique) · full_name\nphone · current_role\ncurrent_company\nyears_experience · location\nauth_user_id")]
        D5[("applications\nhiring_post_id · candidate_id\nresume_url · status\nembedding_score\nskill_match_score\nexperience_match_score\nculture_match_score\noverall_score\nrecruiter_notes · override")]
        D6[("resume_data\napplication_id (unique)\nparsed_name · parsed_email\nparsed_skills[]\nparsed_experience (jsonb)\nparsed_education (jsonb)\nparsed_summary\nembedding (pgvector 384-dim)\nskill_match_details\nexperience_match_details\nculture_match_details")]
        D7[("interview_templates\norg_id · name\nmax_questions\nmax_duration_minutes\nfoundational_ratio\nscoring_weights (jsonb)\nmust_ask_topics[]")]
        D8[("interview_sessions\napplication_id · template_id\nlivekit_room_name · status\nstarted_at · ended_at\nduration_seconds\nquestions_asked\nrecording_url")]
        D9[("interview_qa\nsession_id · question_number\nquestion_text · answer_text\ntechnical_accuracy\ndepth_of_understanding\ncommunication_clarity\nrelevance_to_jd\nscore_rationale")]
        D10[("interview_reports\nsession_id (unique)\noverall_grade\nrecommendation\nsummary\nstrengths[] · concerns[]\ndimension_averages")]
    end

    subgraph STORAGE["📦 Supabase Storage"]
        ST1["resumes/\napplications/{hiring_post_id}/\n{timestamp}_{filename}"]
        ST2["photos/\ncandidates/{timestamp}_{filename}"]
    end

    subgraph REALTIME["⚡ Supabase Realtime"]
        RT1["applications table\nPostgres changes → browser\ninstant status updates"]
    end

    %% Recruiter → Next.js
    RECRUITER -->|"Supabase client calls\n(direct)"| DB
    RECRUITER -->|"backendFetch → /api/proxy"| NEXTJS

    %% Next.js → Backend
    NEXTJS -->|"server-side HTTP"| BACKEND

    %% Backend → Queue
    A1 -->|"enqueue"| T1
    A3 -->|"enqueue"| T1
    A5 -->|"enqueue"| T1

    %% Queue → Scoring
    T1 -->|"parallel"| SCORING

    %% Queue → Email
    T1 -->|"auto-advance / reject"| E2
    T1 -->|"rejection"| E3
    T2 -->|"outcome"| E4
    A4 --> EMAIL
    A6 -->|"status change"| E5
    A7 --> E6
    P3 --> E1

    %% Scoring → DB
    SCORING -->|"store scores + parsed fields\nstore embedding (pgvector)"| D5
    SCORING -->|"store parsed resume\nstore embedding"| D6

    %% Queue → DB
    T1 -->|"create/update"| D5
    T1 -->|"create"| D8
    T2 -->|"create"| D10
    T2 -->|"update status"| D5

    %% Storage
    T1 -->|"download resume"| ST1
    RECRUITER -->|"upload files"| STORAGE

    %% Realtime
    D5 -->|"row change event"| RT1
    RT1 -->|"push to browser"| RECRUITER
```

---

## Recruiter Workflow: Step-by-Step

```mermaid
sequenceDiagram
    actor Recruiter
    participant FE as Next.js Frontend
    participant BE as FastAPI Backend
    participant CQ as Celery Queue
    participant AI as OpenAI GPT-4o-mini
    participant SB as Supabase DB
    participant EM as Resend Email

    Note over Recruiter,SB: ── PHASE 1: JOB SETUP ──────────────────────────────────

    Recruiter->>FE: Fill job form (title, skills, threshold, max_questions)
    FE->>SB: INSERT interview_templates (max_questions, max_duration, scoring_weights)
    FE->>SB: INSERT hiring_posts (links to template, share_slug generated)
    SB-->>Recruiter: Job live at /apply/{share_slug}

    Note over Recruiter,SB: ── PHASE 2: RESUME SCREENING ───────────────────────────

    Note over BE,EM: (Candidate submits application — separate candidate flow)
    BE->>CQ: Enqueue screen_resume_task(application_id)
    CQ->>SB: Fetch application + hiring_post + required_skills
    CQ->>SB: Download resume from Storage
    par Parallel Scoring
        CQ->>AI: parse_resume() → structured fields
        CQ->>AI: score_embedding_similarity() → cosine score
        CQ->>AI: score_skill_match() → per-skill confidence
        CQ->>AI: score_experience_match() → seniority + evidence
        CQ->>AI: score_culture_match() → signals + evidence
    end
    CQ->>SB: UPDATE applications SET scores, status="screened"
    CQ->>SB: INSERT/UPDATE resume_data (parsed fields + embedding)

    alt overall_score ≥ threshold
        CQ->>SB: UPDATE status="interview_sent", INSERT interview_sessions
        CQ->>EM: send_interview_invitation(candidate_email, portal_link, deadline)
    else overall_score < (threshold - 5%)
        CQ->>SB: UPDATE status="resume_rejected"
        CQ->>EM: send_rejection(candidate_email)
    else in review band
        Note over SB: status stays "screened" → recruiter reviews manually
    end

    SB-->>FE: Realtime push → application status updated in dashboard

    Note over Recruiter,SB: ── PHASE 3: RECRUITER REVIEW ───────────────────────────

    Recruiter->>FE: Open /candidates
    FE->>SB: SELECT applications with scores, ORDER BY overall_score DESC
    SB-->>FE: Candidate list with scores + statuses

    Recruiter->>FE: Click candidate → /candidates/[id]
    FE->>SB: Fetch application + resume_data + sessions + qa + reports
    FE-->>Recruiter: Profile tab (parsed resume), Screening Scores

    Recruiter->>FE: Click "View Score Details"
    FE->>SB: Fetch skill_match_details, experience_match_details, culture_match_details
    FE-->>Recruiter: Evidence extracts, per-skill reasoning, seniority analysis

    alt Recruiter overrides recommendation
        Recruiter->>FE: Submit override form (recommendation + notes)
        FE->>BE: POST /api/proxy/api/reports/{id}/override
        BE->>SB: UPDATE interview_reports SET override_recommendation, notes
    end

    Note over Recruiter,SB: ── PHASE 4: INTERVIEW ──────────────────────────────────

    Note over BE,EM: (Candidate completes AI voice interview — separate candidate flow)
    CQ->>AI: Score each Q&A (technical, depth, communication, relevance)
    CQ->>SB: INSERT interview_reports (grade, recommendation, summary, strengths, concerns)
    CQ->>SB: UPDATE applications status (shortlisted / interviewed / interview_rejected)
    CQ->>EM: send_interview_completed(candidate, recommendation)

    SB-->>FE: Realtime push → interview tab populated

    Recruiter->>FE: Open Interview tab in candidate detail
    FE-->>Recruiter: Per-session blocks: summary, Q&A transcript, recording player
```

---

## Resume Screening Pipeline (Detail)

```mermaid
flowchart LR
    APP["Application Created\nstatus = applied"]

    subgraph DOWNLOAD["1. Ingest"]
        DL["Download resume\nfrom Supabase Storage"]
        EX["Extract text\npdfplumber / python-docx"]
    end

    subgraph PARALLEL["2. Parallel Scoring  (ThreadPoolExecutor)"]
        direction TB
        PA["parse_resume()\n→ name, email, skills,\nexperience, education,\nprojects, certifications"]
        PB["score_embedding_similarity()\n→ embed resume (384-dim)\n→ embed JD (384-dim)\n→ cosine similarity (0-1)"]
        PC["score_skill_match()\n→ evaluate each required skill\n→ confidence score per skill\n→ matched / partial / missing"]
        PD["score_experience_match()\n→ seniority_alignment\n→ years_of_experience\n→ project_complexity\n→ domain_relevance\n+ evidence extract"]
        PE["score_culture_match()\n→ collaboration_signals\n→ communication_style\n→ initiative_indicators\n+ evidence extract"]
    end

    subgraph AGGREGATE["3. Aggregate"]
        AGG["overall_score =\n  embedding   × 20%\n+ skill_match × 35%\n+ experience  × 25%\n+ culture     × 20%"]
    end

    subgraph STORE["4. Store"]
        S1["UPDATE applications\nscores + status"]
        S2["INSERT resume_data\nparsed fields + embedding\n+ detail JSON (evidence)"]
    end

    subgraph DECISION["5. Auto-Advance Logic"]
        D1{"score ≥ threshold?"}
        D2{"score < threshold - 5%?"}
        ADV["status = interview_sent\nINSERT interview_sessions\n→ send invitation email"]
        REJ["status = resume_rejected\n→ send rejection email"]
        HOLD["status = screened\n(awaits recruiter review)"]
    end

    APP --> DOWNLOAD
    DOWNLOAD --> PARALLEL
    PARALLEL --> AGGREGATE
    AGGREGATE --> STORE
    STORE --> D1
    D1 -- yes --> ADV
    D1 -- no --> D2
    D2 -- yes --> REJ
    D2 -- no --> HOLD
```

---

## Data Model (Recruiter-Relevant Tables)

```mermaid
erDiagram
    organizations {
        uuid id PK
        text name
        jsonb settings
        int data_retention_days
    }
    team_members {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        text role
        text status
    }
    interview_templates {
        uuid id PK
        uuid org_id FK
        text name
        int max_questions
        int max_duration_minutes
        float foundational_ratio
        jsonb scoring_weights
        text[] must_ask_topics
        bool is_preset
    }
    hiring_posts {
        uuid id PK
        uuid org_id FK
        uuid interview_template_id FK
        text title
        text department
        text[] required_skills
        jsonb scoring_weights
        int screening_threshold
        text status
        text share_slug
    }
    candidates {
        uuid id PK
        text email
        text full_name
        uuid auth_user_id
    }
    applications {
        uuid id PK
        uuid hiring_post_id FK
        uuid candidate_id FK
        text status
        float embedding_score
        float skill_match_score
        float experience_match_score
        float culture_match_score
        float overall_score
        text recruiter_notes
        text recruiter_override
    }
    resume_data {
        uuid id PK
        uuid application_id FK
        text[] parsed_skills
        jsonb parsed_experience
        jsonb parsed_education
        jsonb skill_match_details
        jsonb experience_match_details
        jsonb culture_match_details
        vector embedding
    }
    interview_sessions {
        uuid id PK
        uuid application_id FK
        uuid template_id FK
        text status
        int duration_seconds
        int questions_asked
        text recording_url
    }
    interview_qa {
        uuid id PK
        uuid session_id FK
        int question_number
        text question_text
        text answer_text
        float technical_accuracy
        float depth_of_understanding
        float communication_clarity
        float relevance_to_jd
    }
    interview_reports {
        uuid id PK
        uuid session_id FK
        float overall_grade
        text recommendation
        text summary
        text[] strengths
        text[] concerns
        jsonb dimension_averages
    }

    organizations ||--o{ team_members : "has"
    organizations ||--o{ interview_templates : "owns"
    organizations ||--o{ hiring_posts : "posts"
    hiring_posts ||--|| interview_templates : "uses"
    hiring_posts ||--o{ applications : "receives"
    candidates ||--o{ applications : "submits"
    applications ||--|| resume_data : "has"
    applications ||--o{ interview_sessions : "has"
    interview_sessions ||--|| interview_templates : "uses"
    interview_sessions ||--o{ interview_qa : "contains"
    interview_sessions ||--|| interview_reports : "generates"
```

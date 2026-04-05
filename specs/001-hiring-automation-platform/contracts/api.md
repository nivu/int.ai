# API Contracts: AI-Powered Hiring Automation Platform

**Branch**: `001-hiring-automation-platform`
**Date**: 2026-04-05

## Overview

Two API surfaces:
1. **Next.js ↔ Supabase**: Direct client queries for CRUD, auth, realtime
   (handled by Supabase client SDK + RLS)
2. **Next.js ↔ Python Backend (FastAPI)**: AI/ML processing, screening
   pipeline, interview orchestration

Base URL (backend): `POST /api/v1/...`
Auth: Supabase JWT in `Authorization: Bearer <token>` header.
All responses: JSON. Errors use RFC 7807 problem details.

---

## Backend API (FastAPI)

### Screening Pipeline

#### POST /api/v1/screening/trigger

Trigger resume screening for a new application. Called by Supabase webhook
or Next.js after application submission.

**Request**:
```json
{
  "application_id": "uuid",
  "hiring_post_id": "uuid"
}
```

**Response** (202 Accepted):
```json
{
  "task_id": "celery-task-uuid",
  "status": "queued"
}
```

**Side effects**: Enqueues Celery task. On completion, updates application
scores in Supabase and triggers auto-advance logic.

---

#### GET /api/v1/screening/status/{task_id}

Poll screening task status.

**Response** (200):
```json
{
  "task_id": "uuid",
  "status": "pending | parsing | scoring | completed | failed",
  "progress": {
    "step": "skill_match",
    "completed_steps": 2,
    "total_steps": 4
  },
  "result": null
}
```

---

### Interview Management

#### POST /api/v1/interview/create-room

Create a LiveKit room for an interview session.

**Request**:
```json
{
  "application_id": "uuid",
  "template_id": "uuid"
}
```

**Response** (201):
```json
{
  "session_id": "uuid",
  "room_name": "interview-{session_id}",
  "candidate_token": "livekit-jwt-token",
  "expires_at": "2026-04-07T23:59:59Z"
}
```

**Notes**: Token is time-limited. Room auto-destroys after expiry.

---

#### POST /api/v1/interview/reconnect

Reconnect to a disconnected interview session.

**Request**:
```json
{
  "session_id": "uuid",
  "reconnection_token": "string"
}
```

**Response** (200):
```json
{
  "room_name": "interview-{session_id}",
  "candidate_token": "new-livekit-jwt-token",
  "questions_completed": 4,
  "time_remaining_seconds": 1200
}
```

**Error** (410 Gone): If reconnection window (5 min) has expired.

---

#### POST /api/v1/interview/evaluate

Trigger post-interview evaluation. Called automatically when LiveKit
session ends.

**Request**:
```json
{
  "session_id": "uuid"
}
```

**Response** (202 Accepted):
```json
{
  "task_id": "celery-task-uuid",
  "status": "queued"
}
```

**Side effects**: Fetches transcript, evaluates each Q&A, generates
report, updates InterviewReport in Supabase.

---

### Email

#### POST /api/v1/email/send

Send transactional email (confirmation, invitation, notification).

**Request**:
```json
{
  "template": "application_confirmation | interview_invitation | status_update",
  "to": "candidate@email.com",
  "data": {
    "candidate_name": "string",
    "job_title": "string",
    "interview_deadline": "2026-04-07T23:59:59Z",
    "portal_url": "https://app.int.ai/portal/...",
    "status": "string"
  }
}
```

**Response** (200):
```json
{
  "message_id": "string",
  "status": "sent"
}
```

---

## Supabase Direct (Client SDK)

These operations go directly through the Supabase client with RLS
enforcement. No backend round-trip needed.

### Hiring Posts CRUD

```
supabase.from('hiring_posts').select('*').eq('org_id', orgId)
supabase.from('hiring_posts').insert({...}).select()
supabase.from('hiring_posts').update({status: 'published'}).eq('id', postId)
```

### Candidate Table (with scores)

```
supabase
  .from('applications')
  .select('*, candidate:candidates(*), resume:resume_data(*)')
  .eq('hiring_post_id', postId)
  .order('overall_score', { ascending: false })
```

### Realtime Subscriptions

```
supabase
  .channel('application-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'applications',
    filter: `hiring_post_id=eq.${postId}`
  }, handleUpdate)
  .subscribe()
```

### File Uploads

```
// Resume upload (client-side direct)
supabase.storage
  .from('resumes')
  .upload(`${applicationId}/resume.pdf`, file)

// Photo upload
supabase.storage
  .from('photos')
  .upload(`${candidateId}/photo.jpg`, file)
```

### Candidate Portal (OTP Auth)

```
// Sign in with OTP
supabase.auth.signInWithOtp({ email: candidateEmail })

// Verify OTP
supabase.auth.verifyOtp({ email, token, type: 'email' })
```

---

## Webhook Contracts

### Supabase → Backend (Database Webhooks)

#### On Application Insert

Triggers screening pipeline when a new application is created.

**Payload** (Supabase webhook format):
```json
{
  "type": "INSERT",
  "table": "applications",
  "record": {
    "id": "uuid",
    "hiring_post_id": "uuid",
    "candidate_id": "uuid",
    "resume_url": "string"
  }
}
```

**Target**: `POST /api/v1/screening/trigger`

---

### LiveKit → Backend (Webhook)

#### On Room Finished

Triggers interview evaluation when a LiveKit room closes.

**Payload** (LiveKit webhook format):
```json
{
  "event": "room_finished",
  "room": {
    "name": "interview-{session_id}",
    "sid": "string"
  }
}
```

**Target**: `POST /api/v1/interview/evaluate`

---

## Error Format (RFC 7807)

All error responses follow:

```json
{
  "type": "https://int.ai/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Application with ID xyz not found",
  "instance": "/api/v1/screening/trigger"
}
```

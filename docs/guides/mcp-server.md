# Hosted MCP server

The backend exposes a [Model Context Protocol](https://modelcontextprotocol.io)
server at **`/mcp`** on the same FastAPI app as the REST API. It lets Claude
(Claude Code, the Agent SDK, or any MCP client that can send a bearer header)
create jobs, review candidates, and check pipeline status inside one org.

| | |
|---|---|
| Transport | Streamable HTTP, stateless, JSON responses |
| URL | `<backend>/mcp` — production: `https://<railway-backend-domain>/mcp` |
| Auth | `Authorization: Bearer intai_…` API key |
| Code | `backend/app/mcp/` (server + tools), `backend/app/api/api_keys.py` (key management) |
| Storage | `api_keys` table (migration `025`) — SHA-256 hash only, never the raw key |

## Getting a key

Settings → **API Keys** → *Create Key*. The full key is shown once. Every key
belongs to the team member who created it and acts inside that member's org;
tool calls record that member as the actor (e.g. `created_by` on a job).
Revoke from the same tab; revocation is immediate.

## Connecting Claude Code

```bash
claude mcp add --transport http int-ai https://<backend>/mcp \
  --header "Authorization: Bearer intai_…"
```

Then in a session: *"List published jobs and show me who's shortlisted for the
backend role."*

## Tools

| Tool | Does |
|---|---|
| `list_jobs` | Jobs in the org, optionally filtered by status |
| `get_job` | One job with its interview template settings and application counts |
| `create_job` | Create a job (and its interview template). Draft by default; `publish=true` publishes |
| `update_job_status` | Move a job to `published`, `closed`, or `archived` |
| `generate_job_description` | AI-written description from title, skills, experience |
| `list_candidates` | Applications with scores, status, LinkedIn, applied date. Filter by job, status, search |
| `get_candidate` | Full view of one application: resume summary, skills, experience, score breakdown, interview report |
| `review_candidate` | Shortlist or reject an application, with optional recruiter notes. Changes status only; no email is sent |
| `get_pipeline_status` | Counts per stage for one job or every job |
| `get_screening_status` | Whether resume screening has finished for an application |

## Configuration

`BACKEND_PUBLIC_URL` (backend env) must be the public base URL of the API
(`https://<railway-backend-domain>`). It is advertised as the MCP resource
identifier and used to accept the deployment's `Host` header. Locally it
defaults to `http://localhost:8000`.

## What it deliberately does not do

- No OAuth. claude.ai's *custom connectors* UI requires OAuth and cannot send
  a static bearer header, so this server is for Claude Code, the Agent SDK and
  similar clients. Adding an OAuth authorization server is a separate piece of work.
- No email side effects from `review_candidate`. The web UI sends rejection
  emails when a recruiter clicks Reject; the MCP tool only changes status, so
  an assistant cannot mass-email candidates by accident.

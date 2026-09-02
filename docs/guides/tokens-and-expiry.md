# Tokens and Expiry in int.ai

## Overview of Expiring Items

This document lists all tokens, sessions, and items that expire in the application and need to be refreshed.

---

## 1. Supabase Auth Tokens (Frontend)

### Access Token
- **What**: JWT token for authenticated API requests
- **Expires**: **1 hour** (3600 seconds)
- **Location**: Browser cookies (managed by Supabase)
- **Refresh**: Automatic via Supabase middleware
- **Config**: `supabase/config.toml` → `jwt_expiry = 3600`

### Refresh Token
- **What**: Token used to get new access tokens
- **Expires**: Configurable (default: never, but rotation enabled)
- **Location**: Browser cookies
- **Refresh**: Automatic when access token expires
- **Config**: `supabase/config.toml` → `enable_refresh_token_rotation = true`
- **Reuse Window**: 10 seconds after expiry

**Your Error**: "Invalid Refresh Token: Refresh Token Not Found"
- **Cause**: Refresh token missing from cookies or expired
- **Fix**: User needs to log in again

---

## 2. LiveKit Interview Tokens

### Candidate Access Token
- **What**: Token for candidate to join interview room
- **Expires**: **2 hours** (7200 seconds)
- **Location**: `backend/app/interview/session_manager.py`
- **Code**: `_TOKEN_TTL = timedelta(hours=2)`
- **Refresh**: Generate new token via reconnection

### Reconnection Token
- **What**: One-time token to reconnect if disconnected
- **Expires**: **5 minutes** (300 seconds)
- **Location**: `backend/app/interview/session_manager.py`
- **Code**: `_RECONNECT_WINDOW = timedelta(minutes=5)`
- **Refresh**: Cannot be refreshed - must restart interview

**Usage**:
```python
candidate_token, expires_at = _generate_candidate_token(room_name, identity)
# Returns JWT valid for 2 hours
```

---

## 3. Interview Session Deadlines

### Interview Deadline
- **What**: Deadline for candidate to complete interview
- **Expires**: **7 days** from invitation
- **Location**: `interview_sessions.deadline` column
- **Code**: `backend/app/tasks/screen_resume.py`
- **Set When**: Resume screening passes threshold
- **Refresh**: Not refreshable - hard deadline

```python
deadline_dt = datetime.now(timezone.utc) + timedelta(days=7)
```

---

## 4. Interview Report Share Links

### Share Token
- **What**: Public link to view interview report
- **Expires**: **7 days** from generation
- **Location**: `interview_reports.share_expires_at` column
- **Code**: Database column
- **Refresh**: Can generate new share link

**Check Expiry**:
```typescript
if (report.share_expires_at && new Date(report.share_expires_at) < new Date()) {
  // Link expired
}
```

**URL Format**: `/report/[token]`

---

## 5. Storage Signed URLs

### File Download URLs
- **What**: Temporary URLs for private file access (resumes, etc.)
- **Expires**: **1 hour** (3600 seconds) - default
- **Location**: `backend/app/services/supabase.py`
- **Code**: `get_signed_url(bucket, path, expires_in=3600)`
- **Refresh**: Generate new signed URL

```python
def get_signed_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    response = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    return response["signedURL"]
```

---

## 6. OTP (One-Time Password) for Candidates

### Email OTP
- **What**: 6-digit code sent to candidate email
- **Expires**: **10 minutes** (estimated)
- **Location**: Supabase Auth
- **Rate Limit**: Max 3 attempts
- **Refresh**: Request new OTP

**Usage**: Candidate portal authentication

---

## Summary Table

| Item | Expires After | Auto-Refresh? | Manual Refresh? |
|------|---------------|---------------|-----------------|
| **Supabase Access Token** | 1 hour | ✅ Yes (middleware) | ❌ No |
| **Supabase Refresh Token** | Configurable | ✅ Yes (rotation) | ❌ No |
| **LiveKit Candidate Token** | 2 hours | ❌ No | ✅ Yes (reconnect) |
| **Reconnection Token** | 5 minutes | ❌ No | ❌ No |
| **Interview Deadline** | 7 days | ❌ No | ❌ No |
| **Report Share Link** | 7 days | ❌ No | ✅ Yes (new link) |
| **Storage Signed URL** | 1 hour | ❌ No | ✅ Yes (new URL) |
| **Email OTP** | 10 minutes | ❌ No | ✅ Yes (resend) |

---

## Common Expiry Issues

### 1. "Invalid Refresh Token: Refresh Token Not Found"

**Cause**: 
- User's refresh token expired or was deleted
- Cookies were cleared
- User switched browsers/devices

**Solution**:
```typescript
// Redirect to login
router.push('/auth/login');
```

### 2. "LiveKit Token Expired"

**Cause**: Candidate token expired after 2 hours

**Solution**:
```python
# Use reconnection token (if within 5 minutes)
await reconnect_session(session_id, reconnection_token)

# Or start new session
await start_session_from_existing(session_id)
```

### 3. "Interview Deadline Passed"

**Cause**: 7 days elapsed since invitation

**Solution**:
- Extend deadline manually in database
- Or send new invitation

### 4. "Report Link Expired"

**Cause**: Share link older than 7 days

**Solution**:
```sql
-- Generate new share token
UPDATE interview_reports 
SET share_token = gen_random_uuid(),
    share_expires_at = now() + interval '7 days'
WHERE id = 'report_id';
```

---

## Configuration Files

### Supabase Auth Config
**File**: `supabase/config.toml`

```toml
[auth]
# Access token expiry (1 hour)
jwt_expiry = 3600

# Refresh token rotation
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
```

### LiveKit Token Config
**File**: `backend/app/interview/session_manager.py`

```python
_TOKEN_TTL = timedelta(hours=2)        # Candidate token: 2 hours
_RECONNECT_WINDOW = timedelta(minutes=5)  # Reconnect: 5 minutes
```

### Interview Deadline Config
**File**: `backend/app/tasks/screen_resume.py`

```python
deadline_dt = datetime.now(timezone.utc) + timedelta(days=7)  # 7 days
```

---

## Monitoring Expiry

### Check Token Expiry in Logs

**Supabase Auth**:
```bash
# Check middleware logs
grep "auth.getUser" logs/frontend.log
```

**LiveKit Tokens**:
```bash
# Check agent logs
grep "expires_at" logs/agent.log
```

**Interview Deadlines**:
```sql
-- Find expiring interviews
SELECT id, deadline, status 
FROM interview_sessions 
WHERE deadline < now() + interval '1 day'
AND status = 'pending';
```

---

## Best Practices

1. **Always handle token expiry gracefully**
   - Show user-friendly error messages
   - Redirect to login when auth tokens expire
   - Provide "resend" options for OTPs

2. **Log expiry events**
   - Track when tokens expire
   - Monitor refresh failures
   - Alert on high expiry rates

3. **Set appropriate expiry times**
   - Short for sensitive operations (OTP: 10 min)
   - Medium for sessions (LiveKit: 2 hours)
   - Long for deadlines (Interview: 7 days)

4. **Implement auto-refresh where possible**
   - Supabase middleware handles auth tokens
   - Consider background refresh for LiveKit tokens

5. **Provide manual refresh options**
   - "Resend OTP" button
   - "Generate new share link" button
   - "Extend deadline" admin action

---

## Fixing Your Current Error

**Error**: "Invalid Refresh Token: Refresh Token Not Found"

**Quick Fix**:
1. Clear browser cookies
2. Log out completely
3. Log back in

**Code Fix** (add error handling):

```typescript
// In your auth component
try {
  const { data: { user } } = await supabase.auth.getUser();
} catch (error) {
  if (error.message.includes('Refresh Token')) {
    // Clear session and redirect to login
    await supabase.auth.signOut();
    router.push('/auth/login');
  }
}
```

**Middleware Fix** (already implemented):

```typescript
// frontend/lib/supabase/middleware.ts
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  // Redirect to login if no valid session
  return NextResponse.redirect(new URL('/auth/login', request.url));
}
```

---

**Last Updated**: April 30, 2026

# Auth Error Fix - Invalid Refresh Token

## Error Details

**Error Type**: `AuthApiError`  
**Error Message**: `Invalid Refresh Token: Refresh Token Not Found`  
**Cause**: Your authentication session has expired or the refresh token is invalid

## Quick Fix

### Option 1: Clear Browser Storage (Recommended)

1. **Open Browser Console** (F12 or Cmd+Option+I on Mac)
2. **Go to Application/Storage tab**
3. **Clear all storage**:
   - Click "Clear site data" or
   - Manually delete:
     - Cookies
     - Local Storage
     - Session Storage
4. **Refresh the page** (Cmd+Shift+R or Ctrl+Shift+R)
5. **Log in again**

### Option 2: Use Incognito/Private Window

1. Open a new incognito/private browser window
2. Navigate to http://localhost:3000
3. Log in with your credentials

### Option 3: Clear Specific Storage Keys

Open browser console and run:

```javascript
// Clear all Supabase auth data
localStorage.clear();
sessionStorage.clear();

// Or specifically clear Supabase keys
Object.keys(localStorage).forEach(key => {
  if (key.includes('supabase') || key.includes('auth')) {
    localStorage.removeItem(key);
  }
});

// Reload the page
window.location.reload();
```

## Why This Happens

This error occurs when:
1. **Session expired** - You've been logged in for too long
2. **Token invalidated** - The refresh token was revoked or expired
3. **Database reset** - Auth tokens were cleared from the database
4. **Multiple tabs** - Conflicting auth states across browser tabs

## After Fixing

Once you've cleared the storage:

1. **Go to login page**: http://localhost:3000/auth/login
2. **Enter your credentials**
3. **You should be logged in successfully**

## For Testing/Development

If you're testing and need to quickly reset auth:

### Create a Test User

If you need a fresh test account, you can:

1. **Sign up** at http://localhost:3000/auth/signup
2. Or use an existing test account

### Common Test Credentials

Check your `.env.local` file or ask your team for test credentials.

## Preventing This Error

To avoid this in the future:

1. **Don't keep sessions open for too long** - Log out when done
2. **Use one browser tab** - Multiple tabs can cause conflicts
3. **Clear storage between tests** - Especially when testing auth flows
4. **Check token expiry** - Supabase tokens typically expire after 1 hour

## Technical Details

The error occurs in the Supabase auth flow when:

```typescript
// Supabase tries to refresh the token
const { data, error } = await supabase.auth.refreshSession();

// But the refresh token is not found or invalid
// Error: "Invalid Refresh Token: Refresh Token Not Found"
```

This is a **client-side issue** - the server is working fine. You just need to clear your local auth state and log in again.

## Still Having Issues?

If clearing storage doesn't work:

1. **Check if backend is running**: http://localhost:8000/docs
2. **Check Supabase connection**: Verify `.env.local` has correct Supabase credentials
3. **Try a different browser**: Rule out browser-specific issues
4. **Check network tab**: Look for failed auth requests

## Summary

✅ **Quick Fix**: Clear browser storage and log in again  
✅ **Root Cause**: Expired or invalid refresh token  
✅ **Prevention**: Log out properly, use one tab, clear storage between tests  
✅ **Not a Server Issue**: Backend is working fine, this is client-side auth state

---

**Next Steps**: Clear your browser storage and log in again at http://localhost:3000/auth/login

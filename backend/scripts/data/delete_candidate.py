"""Script to delete a candidate and all related data by email."""

import sys
from app.services.supabase import supabase as sb

def delete_candidate_by_email(email: str) -> None:
    """Delete a candidate and all related data by email.
    
    This will delete:
    1. Interview sessions
    2. Applications
    3. Candidate record
    4. Auth user (if exists)
    """
    email = email.lower().strip()
    
    print(f"🔍 Looking for candidate with email: {email}")
    
    # 1. Find the candidate
    try:
        candidate_resp = sb.table("candidates").select("*").eq("email", email).execute()
        if not candidate_resp.data or len(candidate_resp.data) == 0:
            print(f"❌ No candidate found with email: {email}")
            return
        
        candidate = candidate_resp.data[0]
        candidate_id = candidate["id"]
        auth_user_id = candidate.get("auth_user_id")
        
        print(f"✅ Found candidate: {candidate['full_name']} (ID: {candidate_id})")
        
    except Exception as e:
        print(f"❌ Error finding candidate: {e}")
        return
    
    # 2. Delete interview sessions
    try:
        # Find applications first to get interview sessions
        apps_resp = sb.table("applications").select("id").eq("candidate_id", candidate_id).execute()
        application_ids = [app["id"] for app in apps_resp.data]
        
        if application_ids:
            print(f"📋 Found {len(application_ids)} application(s)")
            
            # Delete interview sessions for these applications
            for app_id in application_ids:
                sessions_resp = sb.table("interview_sessions").select("id").eq("application_id", app_id).execute()
                session_ids = [s["id"] for s in sessions_resp.data]
                
                if session_ids:
                    print(f"  🎤 Deleting {len(session_ids)} interview session(s) for application {app_id}")
                    for session_id in session_ids:
                        sb.table("interview_sessions").delete().eq("id", session_id).execute()
                    print(f"  ✅ Deleted interview sessions")
        
    except Exception as e:
        print(f"⚠️  Error deleting interview sessions: {e}")
    
    # 3. Delete applications
    try:
        if application_ids:
            print(f"📝 Deleting {len(application_ids)} application(s)")
            for app_id in application_ids:
                sb.table("applications").delete().eq("id", app_id).execute()
            print(f"✅ Deleted applications")
    except Exception as e:
        print(f"⚠️  Error deleting applications: {e}")
    
    # 4. Delete candidate record
    try:
        print(f"👤 Deleting candidate record")
        sb.table("candidates").delete().eq("id", candidate_id).execute()
        print(f"✅ Deleted candidate record")
    except Exception as e:
        print(f"❌ Error deleting candidate: {e}")
        return
    
    # 5. Delete auth user if exists
    if auth_user_id:
        try:
            print(f"🔐 Deleting auth user (ID: {auth_user_id})")
            sb.auth.admin.delete_user(auth_user_id)
            print(f"✅ Deleted auth user")
        except Exception as e:
            print(f"⚠️  Error deleting auth user: {e}")
    
    print(f"\n✨ Successfully deleted candidate: {email}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python delete_candidate.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    delete_candidate_by_email(email)

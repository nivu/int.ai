"""Script to delete multiple users by email."""

import os
import sys
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

headers = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def delete_user_by_email(email: str) -> bool:
    """Delete a user and all related data by email."""
    email = email.lower().strip()
    
    print(f"\n{'='*60}")
    print(f"🔍 Processing: {email}")
    print(f"{'='*60}")
    
    # 1. Find the user in candidates table
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/candidates",
            headers=headers,
            params={"email": f"eq.{email}", "select": "*"}
        )
        response.raise_for_status()
        candidates = response.json()
        
        if not candidates:
            print(f"⚠️  No candidate found with email: {email}")
            # Still try to delete from auth
            try:
                # Search for auth user by email
                auth_response = requests.get(
                    f"{SUPABASE_URL}/auth/v1/admin/users",
                    headers=headers,
                    params={"email": email}
                )
                if auth_response.status_code == 200:
                    auth_users = auth_response.json()
                    if auth_users and len(auth_users) > 0:
                        auth_user_id = auth_users[0]["id"]
                        print(f"🔐 Found auth user (ID: {auth_user_id})")
                        del_response = requests.delete(
                            f"{SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}",
                            headers=headers
                        )
                        if del_response.status_code in [200, 204]:
                            print(f"✅ Deleted auth user")
                            return True
            except Exception as e:
                print(f"⚠️  Error checking/deleting auth user: {e}")
            return False
        
        candidate = candidates[0]
        candidate_id = candidate["id"]
        auth_user_id = candidate.get("auth_user_id")
        
        print(f"✅ Found candidate: {candidate.get('full_name', 'N/A')} (ID: {candidate_id})")
        
    except Exception as e:
        print(f"❌ Error finding candidate: {e}")
        return False
    
    # 2. Find and delete interview sessions and related data
    try:
        # Find applications
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=headers,
            params={"candidate_id": f"eq.{candidate_id}", "select": "id"}
        )
        response.raise_for_status()
        applications = response.json()
        application_ids = [app["id"] for app in applications]
        
        if application_ids:
            print(f"📋 Found {len(application_ids)} application(s)")
            
            # Delete interview sessions and their QA pairs for each application
            for app_id in application_ids:
                response = requests.get(
                    f"{SUPABASE_URL}/rest/v1/interview_sessions",
                    headers=headers,
                    params={"application_id": f"eq.{app_id}", "select": "id"}
                )
                response.raise_for_status()
                sessions = response.json()
                
                if sessions:
                    print(f"  🎤 Found {len(sessions)} interview session(s) for application {app_id}")
                    for session in sessions:
                        session_id = session['id']
                        
                        # Delete interview reports first
                        try:
                            reports_response = requests.delete(
                                f"{SUPABASE_URL}/rest/v1/interview_reports",
                                headers=headers,
                                params={"session_id": f"eq.{session_id}"}
                            )
                            if reports_response.status_code in [200, 204]:
                                print(f"    📊 Deleted reports for session {session_id}")
                        except Exception as e:
                            print(f"    ⚠️  Error deleting reports: {e}")
                        
                        # Delete QA pairs
                        try:
                            qa_response = requests.delete(
                                f"{SUPABASE_URL}/rest/v1/interview_qa",
                                headers=headers,
                                params={"session_id": f"eq.{session_id}"}
                            )
                            if qa_response.status_code in [200, 204]:
                                print(f"    💬 Deleted QA pairs for session {session_id}")
                        except Exception as e:
                            print(f"    ⚠️  Error deleting QA pairs: {e}")
                        
                        # Now delete the session
                        try:
                            del_response = requests.delete(
                                f"{SUPABASE_URL}/rest/v1/interview_sessions",
                                headers=headers,
                                params={"id": f"eq.{session_id}"}
                            )
                            del_response.raise_for_status()
                            print(f"    ✅ Deleted interview session {session_id}")
                        except Exception as e:
                            print(f"    ⚠️  Error deleting session: {e}")
        
    except Exception as e:
        print(f"⚠️  Error processing interview sessions: {e}")
    
    # 3. Delete resume_data
    try:
        if application_ids:
            for app_id in application_ids:
                response = requests.delete(
                    f"{SUPABASE_URL}/rest/v1/resume_data",
                    headers=headers,
                    params={"application_id": f"eq.{app_id}"}
                )
                if response.status_code in [200, 204]:
                    print(f"  📄 Deleted resume data for application {app_id}")
    except Exception as e:
        print(f"⚠️  Error deleting resume data: {e}")
    
    # 4. Delete applications
    try:
        if application_ids:
            print(f"📝 Deleting {len(application_ids)} application(s)")
            for app_id in application_ids:
                response = requests.delete(
                    f"{SUPABASE_URL}/rest/v1/applications",
                    headers=headers,
                    params={"id": f"eq.{app_id}"}
                )
                response.raise_for_status()
            print(f"✅ Deleted applications")
    except Exception as e:
        print(f"⚠️  Error deleting applications: {e}")
    
    # 5. Delete candidate record
    try:
        print(f"👤 Deleting candidate record")
        response = requests.delete(
            f"{SUPABASE_URL}/rest/v1/candidates",
            headers=headers,
            params={"id": f"eq.{candidate_id}"}
        )
        response.raise_for_status()
        print(f"✅ Deleted candidate record")
    except Exception as e:
        print(f"❌ Error deleting candidate: {e}")
        return False
    
    # 6. Delete auth user if exists
    if auth_user_id:
        try:
            print(f"🔐 Deleting auth user (ID: {auth_user_id})")
            response = requests.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}",
                headers=headers
            )
            if response.status_code in [200, 204]:
                print(f"✅ Deleted auth user")
            else:
                print(f"⚠️  Auth user deletion returned status {response.status_code}")
        except Exception as e:
            print(f"⚠️  Error deleting auth user: {e}")
    
    print(f"✨ Successfully deleted user: {email}")
    return True


if __name__ == "__main__":
    emails = [
        "sriramtantri25@gmail.com",
    ]
    
    print("🗑️  Batch User Deletion")
    print(f"📧 Emails to delete: {len(emails)}")
    print("\nWARNING: This will permanently delete all data for these users!")
    print("Press Ctrl+C to cancel, or Enter to continue...")
    
    try:
        input()
    except KeyboardInterrupt:
        print("\n❌ Cancelled by user")
        sys.exit(0)
    
    success_count = 0
    failed_count = 0
    
    for email in emails:
        try:
            if delete_user_by_email(email):
                success_count += 1
            else:
                failed_count += 1
        except Exception as e:
            print(f"❌ Unexpected error processing {email}: {e}")
            failed_count += 1
    
    print(f"\n{'='*60}")
    print(f"📊 Summary")
    print(f"{'='*60}")
    print(f"✅ Successfully deleted: {success_count}")
    print(f"❌ Failed: {failed_count}")
    print(f"📧 Total processed: {len(emails)}")

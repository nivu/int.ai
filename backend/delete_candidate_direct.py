"""Direct script to delete a candidate using Supabase REST API."""

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

def delete_candidate_by_email(email: str) -> None:
    """Delete a candidate and all related data by email."""
    email = email.lower().strip()
    
    print(f"🔍 Looking for candidate with email: {email}")
    
    # 1. Find the candidate
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/candidates",
            headers=headers,
            params={"email": f"eq.{email}", "select": "*"}
        )
        response.raise_for_status()
        candidates = response.json()
        
        if not candidates:
            print(f"❌ No candidate found with email: {email}")
            return
        
        candidate = candidates[0]
        candidate_id = candidate["id"]
        auth_user_id = candidate.get("auth_user_id")
        
        print(f"✅ Found candidate: {candidate['full_name']} (ID: {candidate_id})")
        
    except Exception as e:
        print(f"❌ Error finding candidate: {e}")
        return
    
    # 2. Find and delete interview sessions
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
            
            # Delete interview sessions for each application
            for app_id in application_ids:
                response = requests.get(
                    f"{SUPABASE_URL}/rest/v1/interview_sessions",
                    headers=headers,
                    params={"application_id": f"eq.{app_id}", "select": "id"}
                )
                response.raise_for_status()
                sessions = response.json()
                
                if sessions:
                    print(f"  🎤 Deleting {len(sessions)} interview session(s) for application {app_id}")
                    for session in sessions:
                        del_response = requests.delete(
                            f"{SUPABASE_URL}/rest/v1/interview_sessions",
                            headers=headers,
                            params={"id": f"eq.{session['id']}"}
                        )
                        del_response.raise_for_status()
                    print(f"  ✅ Deleted interview sessions")
        
    except Exception as e:
        print(f"⚠️  Error deleting interview sessions: {e}")
    
    # 3. Delete applications
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
    
    # 4. Delete candidate record
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
        return
    
    # 5. Delete auth user if exists
    if auth_user_id:
        try:
            print(f"🔐 Attempting to delete auth user (ID: {auth_user_id})")
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
    
    print(f"\n✨ Successfully deleted candidate: {email}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python delete_candidate_direct.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    delete_candidate_by_email(email)

"""Script to check all applications for a candidate."""

import sys
from app.services.supabase import supabase as sb

def check_applications(email: str) -> None:
    """Check all applications for a candidate."""
    email = email.lower().strip()
    
    print(f"🔍 Looking for candidate with email: {email}")
    
    # Find the candidate
    try:
        candidate_resp = sb.table("candidates").select("*").eq("email", email).execute()
        if not candidate_resp.data:
            print(f"❌ No candidate found with email: {email}")
            return
        
        candidate = candidate_resp.data[0]
        candidate_id = candidate["id"]
        
        print(f"✅ Found candidate: {candidate['full_name']} (ID: {candidate_id})")
        print(f"   Email: {candidate['email']}")
        print(f"   Phone: {candidate.get('phone', 'N/A')}")
        
    except Exception as e:
        print(f"❌ Error finding candidate: {e}")
        return
    
    # Find all applications
    try:
        apps_resp = sb.table("applications").select("*, hiring_posts(title, department)").eq("candidate_id", candidate_id).execute()
        applications = apps_resp.data
        
        if not applications:
            print(f"\n❌ No applications found for this candidate")
            return
        
        print(f"\n📋 Found {len(applications)} application(s):")
        print("="*80)
        
        for i, app in enumerate(applications, 1):
            print(f"\nApplication #{i}")
            print(f"  ID: {app['id']}")
            print(f"  Job Title: {app.get('hiring_posts', {}).get('title', 'Unknown')}")
            print(f"  Department: {app.get('hiring_posts', {}).get('department', 'Unknown')}")
            print(f"  Status: {app.get('status', 'unknown')}")
            print(f"  Overall Score: {app.get('overall_score', 'N/A')}")
            print(f"  Applied At: {app.get('created_at', 'N/A')}")
            
            # Check for interview sessions
            try:
                sessions_resp = sb.table("interview_sessions").select("*").eq("application_id", app['id']).execute()
                sessions = sessions_resp.data
                
                if sessions:
                    print(f"  🎤 Interview Sessions: {len(sessions)}")
                    for j, session in enumerate(sessions, 1):
                        print(f"     Session #{j}:")
                        print(f"       ID: {session['id']}")
                        print(f"       Status: {session.get('status', 'unknown')}")
                        print(f"       Started: {session.get('started_at', 'N/A')}")
                        print(f"       Ended: {session.get('ended_at', 'N/A')}")
                        print(f"       Questions Asked: {session.get('questions_asked', 0)}")
                else:
                    print(f"  🎤 Interview Sessions: None")
            except Exception as e:
                print(f"  ⚠️  Error checking sessions: {e}")
        
        print("\n" + "="*80)
        
    except Exception as e:
        print(f"❌ Error finding applications: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_candidate_applications.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    check_applications(email)

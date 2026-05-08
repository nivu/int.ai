"""Script to reset interview session for a candidate by email.

This allows a candidate to retake the interview from the beginning by:
1. Deleting interview Q&A records
2. Deleting interview reports
3. Deleting interview sessions
4. Keeping the application and candidate profile intact
"""

import sys
from app.services.supabase import supabase as sb

def reset_interview_by_email(email: str, job_title: str = None) -> None:
    """Reset interview session for a candidate by email.
    
    Args:
        email: Candidate email address
        job_title: Optional job title to filter applications (e.g., "Beginner Python Developer")
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
        
        print(f"✅ Found candidate: {candidate['full_name']} (ID: {candidate_id})")
        
    except Exception as e:
        print(f"❌ Error finding candidate: {e}")
        return
    
    # 2. Find applications
    try:
        query = sb.table("applications").select("*, hiring_posts(title)").eq("candidate_id", candidate_id)
        apps_resp = query.execute()
        applications = apps_resp.data
        
        if not applications:
            print(f"❌ No applications found for this candidate")
            return
        
        # Filter by job title if provided
        if job_title:
            applications = [app for app in applications if app.get("hiring_posts", {}).get("title", "").lower() == job_title.lower()]
            if not applications:
                print(f"❌ No applications found for job title: {job_title}")
                return
        
        print(f"📋 Found {len(applications)} application(s)")
        
    except Exception as e:
        print(f"❌ Error finding applications: {e}")
        return
    
    # 3. Reset interview sessions for each application
    total_deleted = {
        "interview_qa": 0,
        "interview_reports": 0,
        "interview_sessions": 0
    }
    
    for app in applications:
        app_id = app["id"]
        job_name = app.get("hiring_posts", {}).get("title", "Unknown")
        print(f"\n📝 Processing application for: {job_name}")
        print(f"   Application ID: {app_id}")
        print(f"   Status: {app.get('status', 'unknown')}")
        
        # Find interview sessions
        try:
            sessions_resp = sb.table("interview_sessions").select("*").eq("application_id", app_id).execute()
            sessions = sessions_resp.data
            
            if not sessions:
                print(f"   ℹ️  No interview sessions found")
                continue
            
            print(f"   🎤 Found {len(sessions)} interview session(s)")
            
            for session in sessions:
                session_id = session["id"]
                session_status = session.get("status", "unknown")
                print(f"\n   Processing session: {session_id}")
                print(f"   Session status: {session_status}")
                
                # Delete interview Q&A
                try:
                    qa_resp = sb.table("interview_qa").delete().eq("session_id", session_id).execute()
                    qa_count = len(qa_resp.data) if qa_resp.data else 0
                    total_deleted["interview_qa"] += qa_count
                    if qa_count > 0:
                        print(f"      ✓ Deleted {qa_count} Q&A record(s)")
                except Exception as e:
                    print(f"      ⚠️  Error deleting Q&A: {e}")
                
                # Delete interview reports
                try:
                    report_resp = sb.table("interview_reports").delete().eq("session_id", session_id).execute()
                    report_count = len(report_resp.data) if report_resp.data else 0
                    total_deleted["interview_reports"] += report_count
                    if report_count > 0:
                        print(f"      ✓ Deleted {report_count} interview report(s)")
                except Exception as e:
                    print(f"      ⚠️  Error deleting reports: {e}")
                
                # Delete interview session
                try:
                    sb.table("interview_sessions").delete().eq("id", session_id).execute()
                    total_deleted["interview_sessions"] += 1
                    print(f"      ✓ Deleted interview session")
                except Exception as e:
                    print(f"      ⚠️  Error deleting session: {e}")
            
            # Reset application status to allow re-interview
            try:
                sb.table("applications").update({
                    "status": "screened"  # Reset to screened so they can be invited again
                }).eq("id", app_id).execute()
                print(f"   ✓ Reset application status to 'screened'")
            except Exception as e:
                print(f"   ⚠️  Error resetting application status: {e}")
                
        except Exception as e:
            print(f"   ❌ Error processing sessions: {e}")
    
    # 4. Summary
    print(f"\n{'='*60}")
    print(f"✨ Interview reset complete for: {email}")
    print(f"{'='*60}")
    print(f"Deleted:")
    print(f"  • {total_deleted['interview_sessions']} interview session(s)")
    print(f"  • {total_deleted['interview_qa']} Q&A record(s)")
    print(f"  • {total_deleted['interview_reports']} interview report(s)")
    print(f"\n✅ The candidate can now retake the interview from the beginning")
    print(f"   Their application status has been reset to 'screened'")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python reset_interview.py <email> [job_title]")
        print("\nExamples:")
        print("  python reset_interview.py team@nunnarilabs.com")
        print("  python reset_interview.py team@nunnarilabs.com 'Beginner Python Developer'")
        sys.exit(1)
    
    email = sys.argv[1]
    job_title = sys.argv[2] if len(sys.argv) > 2 else None
    
    reset_interview_by_email(email, job_title)

#!/usr/bin/env python3
"""
Delete test candidate: team@nunnarilabs.com

This script removes the candidate and all associated data:
- Interview Q&A records
- Interview sessions
- Interview reports
- Resume data
- Applications
- Candidate profile
"""

import sys
from app.services.supabase import supabase

TEST_EMAIL = "team@nunnarilabs.com"


def delete_candidate(email: str):
    """Delete a candidate and all associated data by email."""
    
    print(f"🔍 Searching for candidate: {email}")
    
    # Find candidate
    candidate_result = supabase.table("candidates").select("id, full_name, email").eq("email", email).execute()
    
    if not candidate_result.data:
        print(f"❌ No candidate found with email: {email}")
        return False
    
    candidate = candidate_result.data[0]
    candidate_id = candidate["id"]
    candidate_name = candidate.get("full_name", "Unknown")
    
    print(f"✓ Found candidate: {candidate_name} (ID: {candidate_id})")
    print(f"  Email: {email}")
    print()
    
    # Confirm deletion
    print("⚠️  This will permanently delete:")
    print("   - Candidate profile")
    print("   - All applications")
    print("   - All interview sessions")
    print("   - All interview Q&A records")
    print("   - All interview reports")
    print("   - All resume data")
    print()
    
    confirm = input("Type 'DELETE' to confirm: ")
    if confirm != "DELETE":
        print("❌ Deletion cancelled")
        return False
    
    print()
    print("🗑️  Starting deletion process...")
    print()
    
    # Get all applications for this candidate
    apps_result = supabase.table("applications").select("id").eq("candidate_id", candidate_id).execute()
    applications = apps_result.data or []
    
    print(f"📋 Found {len(applications)} application(s)")
    
    deleted_counts = {
        "interview_qa": 0,
        "interview_reports": 0,
        "interview_sessions": 0,
        "resume_data": 0,
        "applications": 0,
    }
    
    # Delete data for each application
    for app in applications:
        app_id = app["id"]
        print(f"\n  Processing application: {app_id}")
        
        # Get all interview sessions for this application
        sessions_result = supabase.table("interview_sessions").select("id").eq("application_id", app_id).execute()
        sessions = sessions_result.data or []
        
        print(f"    Found {len(sessions)} interview session(s)")
        
        # Delete interview data for each session
        for session in sessions:
            session_id = session["id"]
            
            # Delete interview Q&A
            qa_result = supabase.table("interview_qa").delete().eq("session_id", session_id).execute()
            qa_count = len(qa_result.data) if qa_result.data else 0
            deleted_counts["interview_qa"] += qa_count
            if qa_count > 0:
                print(f"      ✓ Deleted {qa_count} Q&A record(s) for session {session_id}")
            
            # Delete interview reports
            report_result = supabase.table("interview_reports").delete().eq("session_id", session_id).execute()
            report_count = len(report_result.data) if report_result.data else 0
            deleted_counts["interview_reports"] += report_count
            if report_count > 0:
                print(f"      ✓ Deleted {report_count} interview report(s) for session {session_id}")
            
            # Delete interview session
            supabase.table("interview_sessions").delete().eq("id", session_id).execute()
            deleted_counts["interview_sessions"] += 1
            print(f"      ✓ Deleted interview session {session_id}")
        
        # Delete resume data
        resume_result = supabase.table("resume_data").delete().eq("application_id", app_id).execute()
        resume_count = len(resume_result.data) if resume_result.data else 0
        deleted_counts["resume_data"] += resume_count
        if resume_count > 0:
            print(f"    ✓ Deleted {resume_count} resume data record(s)")
        
        # Delete application
        supabase.table("applications").delete().eq("id", app_id).execute()
        deleted_counts["applications"] += 1
        print(f"    ✓ Deleted application {app_id}")
    
    # Delete candidate
    supabase.table("candidates").delete().eq("id", candidate_id).execute()
    print(f"\n✓ Deleted candidate profile: {candidate_name}")
    
    # Summary
    print()
    print("=" * 60)
    print("✅ DELETION COMPLETE")
    print("=" * 60)
    print(f"Candidate: {candidate_name} ({email})")
    print()
    print("Deleted:")
    print(f"  • {deleted_counts['applications']} application(s)")
    print(f"  • {deleted_counts['interview_sessions']} interview session(s)")
    print(f"  • {deleted_counts['interview_qa']} Q&A record(s)")
    print(f"  • {deleted_counts['interview_reports']} interview report(s)")
    print(f"  • {deleted_counts['resume_data']} resume data record(s)")
    print(f"  • 1 candidate profile")
    print()
    
    return True


def main():
    """Main entry point."""
    print()
    print("=" * 60)
    print("DELETE TEST CANDIDATE")
    print("=" * 60)
    print()
    
    try:
        success = delete_candidate(TEST_EMAIL)
        sys.exit(0 if success else 1)
    except Exception as e:
        print()
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

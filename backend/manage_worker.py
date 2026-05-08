#!/usr/bin/env python3
"""
Celery Worker Management Script
Handles starting, stopping, and restarting the Celery worker
"""

import argparse
import os
import signal
import subprocess
import sys
import time


def find_worker_pids():
    """Find all running Celery worker processes."""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "celery.*app.worker"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            return [int(pid) for pid in result.stdout.strip().split('\n')]
        return []
    except Exception as e:
        print(f"Error finding worker PIDs: {e}")
        return []


def stop_worker():
    """Stop all running Celery worker processes."""
    pids = find_worker_pids()
    
    if not pids:
        print("No Celery worker processes found")
        return True
    
    print(f"Found {len(pids)} worker process(es): {pids}")
    
    for pid in pids:
        try:
            print(f"Stopping worker with PID {pid}...")
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            print(f"Process {pid} already stopped")
        except PermissionError:
            print(f"Permission denied to stop process {pid}")
            return False
    
    # Wait for graceful shutdown
    print("Waiting for graceful shutdown...")
    time.sleep(3)
    
    # Check if any processes are still running
    remaining = find_worker_pids()
    if remaining:
        print(f"Force killing remaining processes: {remaining}")
        for pid in remaining:
            try:
                os.kill(pid, signal.SIGKILL)
            except:
                pass
    
    print("Worker stopped successfully")
    return True


def start_worker():
    """Start the Celery worker."""
    print("Starting Celery worker...")
    
    # Change to backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend_dir)
    
    # Start worker in background
    cmd = ["celery", "-A", "app.worker", "worker", "--loglevel=info", "--concurrency=4"]
    
    try:
        # Try to start with subprocess
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True
        )
        time.sleep(2)
        
        # Check if process started successfully
        if process.poll() is None:
            print(f"Celery worker started successfully with PID {process.pid}")
            return True
        else:
            stdout, stderr = process.communicate()
            print(f"Failed to start worker:")
            print(f"STDOUT: {stdout.decode()}")
            print(f"STDERR: {stderr.decode()}")
            return False
    except FileNotFoundError:
        print("Error: 'celery' command not found")
        print("Make sure you're in the virtual environment or celery is installed")
        return False
    except Exception as e:
        print(f"Error starting worker: {e}")
        return False


def restart_worker():
    """Restart the Celery worker."""
    print("Restarting Celery worker...")
    stop_worker()
    time.sleep(1)
    return start_worker()


def status_worker():
    """Check the status of Celery worker."""
    pids = find_worker_pids()
    
    if not pids:
        print("Celery worker is NOT running")
        return False
    else:
        print(f"Celery worker is running with PID(s): {pids}")
        return True


def main():
    parser = argparse.ArgumentParser(description="Manage Celery worker")
    parser.add_argument(
        "action",
        choices=["start", "stop", "restart", "status"],
        help="Action to perform"
    )
    
    args = parser.parse_args()
    
    if args.action == "start":
        sys.exit(0 if start_worker() else 1)
    elif args.action == "stop":
        sys.exit(0 if stop_worker() else 1)
    elif args.action == "restart":
        sys.exit(0 if restart_worker() else 1)
    elif args.action == "status":
        sys.exit(0 if status_worker() else 1)


if __name__ == "__main__":
    main()

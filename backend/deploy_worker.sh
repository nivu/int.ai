#!/bin/bash
# Comprehensive worker deployment and restart script
# Works with Railway, Heroku, Docker, and local setups

set -e

echo "=========================================="
echo "Celery Worker Deployment & Restart Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Detect deployment environment
detect_environment() {
    if [ -n "$RAILWAY_ENVIRONMENT" ]; then
        echo "railway"
    elif [ -n "$HEROKU_APP_NAME" ] || [ -n "$DYNO" ]; then
        echo "heroku"
    elif docker info > /dev/null 2>&1; then
        echo "docker"
    else
        echo "local"
    fi
}

# Railway deployment
deploy_railway() {
    print_info "Deploying to Railway..."
    
    if command -v railway > /dev/null 2>&1; then
        print_info "Installing Railway CLI..."
        npm install -g @railway/cli
    fi
    
    print_info "Restarting worker service..."
    railway service restart worker || railway restart
    
    print_success "Railway worker restarted"
    print_info "Check logs with: railway logs --service worker"
}

# Heroku deployment
deploy_heroku() {
    print_info "Deploying to Heroku..."
    
    if ! command -v heroku > /dev/null 2>&1; then
        print_error "Heroku CLI not found. Install from: https://devcenter.heroku.com/articles/heroku-cli"
        exit 1
    fi
    
    print_info "Restarting worker dyno..."
    heroku ps:restart worker
    
    print_success "Heroku worker restarted"
    print_info "Check logs with: heroku logs --tail --dyno worker"
}

# Docker deployment
deploy_docker() {
    print_info "Deploying with Docker..."
    
    cd "$(dirname "$0")"
    
    if [ -f "docker-compose.yml" ]; then
        print_info "Using Docker Compose..."
        docker-compose restart worker
        print_success "Docker worker container restarted"
        print_info "Check logs with: docker-compose logs -f worker"
    else
        print_info "Finding worker container..."
        CONTAINER=$(docker ps -a | grep -E "(celery|worker)" | awk '{print $1}' | head -1)
        
        if [ -n "$CONTAINER" ]; then
            docker restart "$CONTAINER"
            print_success "Docker worker container restarted"
            print_info "Check logs with: docker logs -f $CONTAINER"
        else
            print_error "No worker container found"
            print_info "Start services with: docker-compose up -d"
            exit 1
        fi
    fi
}

# Local deployment
deploy_local() {
    print_info "Deploying locally..."
    
    cd "$(dirname "$0")"
    
    # Stop existing worker
    print_info "Stopping existing worker..."
    pkill -f "celery.*app.worker" || print_info "No existing worker found"
    sleep 2
    
    # Activate virtual environment if it exists
    if [ -f ".venv/bin/activate" ]; then
        print_info "Activating virtual environment..."
        source .venv/bin/activate
    fi
    
    # Check if celery is available
    if ! command -v celery > /dev/null 2>&1; then
        print_error "Celery not found. Installing dependencies..."
        if command -v uv > /dev/null 2>&1; then
            uv sync
        else
            pip install -e .
        fi
    fi
    
    # Start worker with auto-restart
    print_info "Starting worker with auto-restart..."
    if [ -f "start_worker_with_cron.py" ]; then
        nohup python start_worker_with_cron.py > worker.log 2>&1 &
        print_success "Worker started with auto-restart (PID: $!)"
        print_info "Logs: tail -f worker.log"
    else
        nohup celery -A app.worker worker --loglevel=info --concurrency=4 > worker.log 2>&1 &
        print_success "Worker started (PID: $!)"
        print_info "Logs: tail -f worker.log"
    fi
}

# Main execution
main() {
    ENV=$(detect_environment)
    print_info "Detected environment: $ENV"
    echo ""
    
    case $ENV in
        railway)
            deploy_railway
            ;;
        heroku)
            deploy_heroku
            ;;
        docker)
            deploy_docker
            ;;
        local)
            deploy_local
            ;;
        *)
            print_error "Unknown environment"
            exit 1
            ;;
    esac
    
    echo ""
    print_success "Deployment complete!"
}

# Run main function
main

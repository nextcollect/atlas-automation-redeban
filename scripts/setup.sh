#!/bin/bash

set -e

log() {
    echo -e "\033[0;32m[$(date +'%Y-%m-%d %H:%M:%S')]\033[0m $1"
}

log "Setting up development environment..."

# Install dependencies
log "Installing dependencies..."
npm install

# Install Playwright browsers
log "Installing Playwright browsers..."
npx playwright install chromium

# Copy environment file
if [ ! -f .env ]; then
    log "Creating .env file from template..."
    cp .env.example .env
    log "Please edit .env file with your configuration"
fi

# Create local directories
mkdir -p tmp screenshots logs

log "Setup completed! 🎉"
log "Next steps:"
log "1. Edit .env file with your configuration"
log "2. Run 'npm test' to verify setup"
log "3. Run 'npm start' to start automation"

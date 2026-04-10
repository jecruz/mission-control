#!/bin/bash

# Mission Control Host Startup Helper
# This script ensures the correct Node.js path is used.

# Add Homebrew bin to PATH (where node/pnpm are located)
export PATH="/opt/homebrew/bin:$PATH"

# Navigate to the project root
cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f .env ]; then
  echo "Error: .env file not found. Please run set up first."
  exit 1
fi

# Load and export environment variables (specifically PORT)
set -a
source .env
set +a

# Default port if not set
export PORT=${PORT:-3001}
export HOSTNAME=${HOSTNAME:-0.0.0.0}

echo "🚀 Starting Mission Control on port $PORT..."
node .next/standalone/server.js

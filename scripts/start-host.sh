#!/bin/bash

# Ensure common brew/node paths are in PATH
export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin

# Base directory for the project
PROJECT_ROOT=$(pwd)

# Load environment variables
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Ensure the app uses the project root for data and DB
export MISSION_CONTROL_DATA_DIR="$PROJECT_ROOT/.data"
export MISSION_CONTROL_DB_PATH="$PROJECT_ROOT/.data/mission-control.db"

# Configuration
PORT=${MISSION_CONTROL_PORT:-3001}
STANDALONE_DIR="./.next/standalone"
# Detect nested standalone server path (Next.js nests it based on project root)
SERVER_JS=$(find "$STANDALONE_DIR" -maxdepth 5 -name "server.js" -not -path "*/node_modules/*" | head -n 1)

if [ -z "$SERVER_JS" ]; then
  echo "❌ Error: Could not find standalone server.js. Please run 'pnpm build' first."
  exit 1
fi

# Determine the nested app root inside standalone (where server.js lives)
APP_ROOT=$(dirname "$SERVER_JS")

# Copy static assets into standalone (Next.js requires this for standalone mode)
if [ -d ".next/static" ] && [ ! -d "$APP_ROOT/.next/static" ]; then
  echo "📦 Copying static assets into standalone..."
  cp -r .next/static "$APP_ROOT/.next/static"
fi

# Copy public assets if missing
if [ -d "public" ] && [ ! -d "$APP_ROOT/public" ]; then
  echo "📦 Copying public assets into standalone..."
  cp -r public "$APP_ROOT/public"
fi

echo "🚀 Starting Mission Control on port $PORT..."
echo "📍 Data Directory: $MISSION_CONTROL_DATA_DIR"
echo "📍 Server path: $SERVER_JS"

# Run the server
PORT=$PORT exec node --max-http-header-size=65536 "$SERVER_JS"

#!/bin/bash

# Trap SIGINT (Ctrl+C) to kill background processes
trap "kill 0" SIGINT

echo "Starting Chronicle System..."

# 1. Start Backend
echo "[System] Starting Backend (Port 3000)..."
cd /opt/Chronicle/server
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Default to --dev if no arguments provided
if [ $# -eq 0 ]; then
    npm start -- --dev &
else
    npm start -- "$@" &
fi

# 2. Start CMS (Vue Backend)
echo "[System] Starting CMS (Vite)..."

# Create symlink for faster image serving (bypassing Node proxy)
echo "[System] Optimizing static assets..."
mkdir -p /opt/Chronicle/chronicle-frontend/public/server/data
if [ ! -L "/opt/Chronicle/chronicle-frontend/public/server/data/upload" ]; then
    ln -s /opt/Chronicle/server/data/upload /opt/Chronicle/chronicle-frontend/public/server/data/upload
fi

cd /opt/Chronicle/chronicle-frontend
if [ ! -d "node_modules" ]; then
    echo "Installing CMS dependencies..."
    npm install
fi
npm run dev -- --host 0.0.0.0 --port 5173 &

# 3. Start Frontend (Astro)
echo "[System] Starting Frontend (Astro)..."

# Create symlink for Astro public as well
mkdir -p /opt/Chronicle/astro-frontend/public/server/data
if [ ! -L "/opt/Chronicle/astro-frontend/public/server/data/upload" ]; then
    ln -s /opt/Chronicle/server/data/upload /opt/Chronicle/astro-frontend/public/server/data/upload
fi

cd /opt/Chronicle/astro-frontend
if [ ! -d "node_modules" ]; then
    echo "Installing Astro dependencies..."
    npm install
fi

if [[ "$*" == *"--dev"* ]]; then
    # Dev mode: Slower secondary navigation due to live compilation
    npm run dev -- --host 0.0.0.0 --port 4321 &
else
    # Prod mode: Instant secondary navigation
    echo "[System] Building Astro for Production speed..."
    npm run build
    HOST=0.0.0.0 PORT=4321 node ./dist/server/entry.mjs &
fi

# Wait for all background processes
wait

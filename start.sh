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

# 2. Start Frontend
echo "[System] Starting Frontend (Vite)..."

# Create symlink for faster image serving (bypassing Node proxy)
echo "[System] Optimizing static assets..."
mkdir -p /opt/Chronicle/chronicle-frontend/public/server/data
if [ ! -L "/opt/Chronicle/chronicle-frontend/public/server/data/upload" ]; then
    ln -s /opt/Chronicle/server/data/upload /opt/Chronicle/chronicle-frontend/public/server/data/upload
fi

cd /opt/Chronicle/chronicle-frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
npm run dev -- --host 0.0.0.0 &

# Wait for all background processes
wait

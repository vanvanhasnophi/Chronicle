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
npm start &

# 2. Start Frontend
echo "[System] Starting Frontend (Vite)..."
cd /opt/Chronicle/chronicle-frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
npm run dev -- --host 0.0.0.0 &

# Wait for all background processes
wait

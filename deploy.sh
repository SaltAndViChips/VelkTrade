#!/usr/bin/env bash
set -e

echo "Installing backend dependencies..."
cd backend
npm install

echo "Installing frontend dependencies..."
cd ../frontend
npm install

echo "Building frontend..."
npm run build

echo "Deploying frontend to GitHub Pages..."
npm run deploy

echo "Done."

read -p "Press Enter to exit..."
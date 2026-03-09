#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed. Install Node.js (includes npm) and try again."
  exit 1
fi

cd "$ROOT_DIR"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting LED Matrix Simulator web app..."
npm run dev

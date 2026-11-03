#!/bin/bash
# Double-click this file to start Study Manager on a Mac.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download it from https://nodejs.org, install it, then double-click this file again."
  read -r -p "Press Enter to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing Study Manager for the first time. This takes a minute..."
  npm install || { read -r -p "Installing failed. Press Enter to close."; exit 1; }
fi
(sleep 6 && open http://localhost:5173) &
echo
echo "Starting Study Manager. Your browser will open at http://localhost:5173"
echo "Keep this window open while you use the app. Close it to stop the app."
echo
npm run dev

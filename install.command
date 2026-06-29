#!/bin/zsh
set -euo pipefail

cd -- "$(dirname -- "$0")"

echo "Streetlight installer (macOS)"
echo "This will run: npm install -> npm run build -> npm run setup"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found."
  echo "Install Node.js 20 or newer, then double-click install.command again."
  echo "https://nodejs.org/"
  echo
  read "reply?Press Return to close..."
  exit 1
fi

node scripts/install.mjs

echo
read "reply?Done. Press Return to close..."


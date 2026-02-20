#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"

echo ""
echo "Running VoiceX seed..."
echo ""

cd "$BACKEND_DIR"
npx tsx src/scripts/seed.ts "$@"

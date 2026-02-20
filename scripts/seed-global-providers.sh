#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
npx tsx src/scripts/seed-global-providers.ts

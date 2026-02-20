#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
npx tsx src/scripts/seed-plans.ts

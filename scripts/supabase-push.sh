#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required"
  exit 1
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is not set."
  echo "Run: npx supabase login"
  echo "Or export SUPABASE_ACCESS_TOKEN from https://supabase.com/dashboard/account/tokens"
  exit 1
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-lqrniaqtzuuzovtxqatc}"

if [[ ! -f supabase/.temp/project-ref ]]; then
  echo "Linking project ${PROJECT_REF}..."
  npx supabase link --project-ref "$PROJECT_REF"
fi

echo "Pushing migrations..."
npx supabase db push

echo "Migration list:"
npx supabase migration list

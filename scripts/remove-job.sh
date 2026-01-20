#!/bin/bash
# Remove a job by ID or deactivate it
# Usage: ./scripts/remove-job.sh <job_id> [--hard]

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <job_id> [--hard]"
  echo ""
  echo "Options:"
  echo "  --hard    Permanently delete the job (default: deactivate)"
  exit 1
fi

JOB_ID="$1"
HARD_DELETE="${2:-}"

# Load .env.local if DATABASE_URL not set
if [ -z "$DATABASE_URL" ]; then
  if [ -f .env.local ]; then
    export $(grep -E '^DATABASE_URL=' .env.local | xargs)
  fi
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set. Set it in environment or .env.local"
  exit 1
fi

if [ "$HARD_DELETE" = "--hard" ]; then
  psql "$DATABASE_URL" -c "DELETE FROM jobs WHERE job_id = $JOB_ID;"
  echo "Deleted job $JOB_ID"
else
  psql "$DATABASE_URL" -c "UPDATE jobs SET active = false WHERE job_id = $JOB_ID;"
  echo "Deactivated job $JOB_ID"
fi

#!/bin/bash
# List all monitoring jobs
# Usage: ./scripts/list-jobs.sh

set -e

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

psql "$DATABASE_URL" -c "
SELECT job_id, type, query, interval_minutes as interval, active, last_run_at
FROM jobs
ORDER BY type, query;
"

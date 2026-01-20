#!/bin/bash
# Add a search keyword to monitor
# Usage: ./scripts/add-search.sh <keyword> [interval_minutes]

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <keyword> [interval_minutes]"
  echo "Example: $0 'artificial intelligence' 30"
  exit 1
fi

KEYWORD="$1"
INTERVAL="${2:-15}"

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
INSERT INTO jobs (type, query, interval_minutes)
VALUES ('search', '$KEYWORD', $INTERVAL)
ON CONFLICT DO NOTHING;
"

echo "Added search job for '$KEYWORD' (interval: ${INTERVAL}m)"

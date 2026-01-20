#!/bin/bash
# Add a Twitter profile to monitor
# Usage: ./scripts/add-profile.sh <username> [interval_minutes]

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <username> [interval_minutes]"
  echo "Example: $0 elonmusk 15"
  exit 1
fi

USERNAME="$1"
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
VALUES ('profile', '$USERNAME', $INTERVAL)
ON CONFLICT DO NOTHING;
"

echo "Added profile job for @$USERNAME (interval: ${INTERVAL}m)"

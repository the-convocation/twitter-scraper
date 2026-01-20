#!/bin/bash
# Read scraped tweets from the database
# Usage: ./scripts/read-tweets.sh [options]
#   -l, --limit N      Limit results (default: 50)
#   -c, --criteria X   Filter by criteria (job query)
#   -s, --since DATE   Filter tweets since date (e.g., '2024-01-01')
#   -f, --full         Show full tweet body JSON
#   -h, --help         Show this help

set -e

# Defaults
LIMIT=50
CRITERIA=""
SINCE=""
FULL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -l|--limit)
      LIMIT="$2"
      shift 2
      ;;
    -c|--criteria)
      CRITERIA="$2"
      shift 2
      ;;
    -s|--since)
      SINCE="$2"
      shift 2
      ;;
    -f|--full)
      FULL=true
      shift
      ;;
    -h|--help)
      head -10 "$0" | tail -8
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

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

# Build WHERE clause
WHERE_CLAUSE=""
if [ -n "$CRITERIA" ]; then
  WHERE_CLAUSE="WHERE criteria @> jsonb_build_array('$CRITERIA'::text)"
fi
if [ -n "$SINCE" ]; then
  if [ -n "$WHERE_CLAUSE" ]; then
    WHERE_CLAUSE="$WHERE_CLAUSE AND created_at >= '$SINCE'"
  else
    WHERE_CLAUSE="WHERE created_at >= '$SINCE'"
  fi
fi

if [ "$FULL" = true ]; then
  # Show full JSON body
  psql "$DATABASE_URL" -c "
SELECT
  tweet_id,
  body,
  criteria,
  created_at,
  scraped_at
FROM tweets
$WHERE_CLAUSE
ORDER BY created_at DESC
LIMIT $LIMIT;
"
else
  # Show summary view
  psql "$DATABASE_URL" -c "
SELECT
  tweet_id,
  body->>'username' as username,
  LEFT(body->>'text', 80) as text_preview,
  criteria,
  created_at
FROM tweets
$WHERE_CLAUSE
ORDER BY created_at DESC
LIMIT $LIMIT;
"
fi

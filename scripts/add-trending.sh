#!/bin/bash
# Add a trending location to monitor
# Usage: ./scripts/add-trending.sh <woeid> [interval_minutes]
#
# Common WOEIDs:
#   1          - Worldwide
#   23424977   - United States
#   23424975   - United Kingdom
#   23424856   - Japan
#   23424748   - Australia
#   23424829   - Germany
#   23424819   - France
#   23424768   - Brazil
#   23424848   - India
#   23424950   - Singapore
#   2459115    - New York
#   2442047    - Los Angeles
#   2487956    - San Francisco
#   44418      - London

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <woeid> [interval_minutes]"
  echo ""
  echo "Common WOEIDs:"
  echo "  1          - Worldwide"
  echo "  23424977   - United States"
  echo "  23424975   - United Kingdom"
  echo "  23424856   - Japan"
  echo "  23424748   - Australia"
  echo "  2459115    - New York"
  echo "  2442047    - Los Angeles"
  echo "  2487956    - San Francisco"
  exit 1
fi

WOEID="$1"
INTERVAL="${2:-60}"

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
VALUES ('trending', '$WOEID', $INTERVAL)
ON CONFLICT DO NOTHING;
"

echo "Added trending job for WOEID $WOEID (interval: ${INTERVAL}m)"

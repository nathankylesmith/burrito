#!/bin/bash
# Helper script to load dishes for a region
# Usage: ./scripts/load-dishes.sh <latitude>,<longitude> [radius] [keyword] [region-id] [additional CLI flags...]

set -e

# Load environment variables from admin app
if [ -f "apps/admin/.env.local" ]; then
  export $(cat apps/admin/.env.local | grep -v '^#' | xargs)
fi

DEFAULT_LOCATION="38.0293,-78.4767" # Charlottesville, VA
USER_LOCATION_INPUT=$1
LOCATION=${USER_LOCATION_INPUT:-$DEFAULT_LOCATION}
RADIUS=${2:-3500}
KEYWORD=${3:-""}
REGION_ID=${4:-""}

if [ $# -le 4 ]; then
  shift $#
else
  shift 4
fi
EXTRA_ARGS=("$@")

if [ -z "$USER_LOCATION_INPUT" ]; then
  echo "No location provided; defaulting to Charlottesville ($DEFAULT_LOCATION)."
fi

if [ -z "$LOCATION" ]; then
  echo "Usage: ./scripts/load-dishes.sh <latitude>,<longitude> [radius] [keyword] [region-id]"
  echo "Example: ./scripts/load-dishes.sh $DEFAULT_LOCATION 3500"
  exit 1
fi

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ -z "$GOOGLE_MAPS_API_KEY" ]; then
  echo "Error: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GOOGLE_MAPS_API_KEY must be set"
  echo "Make sure apps/admin/.env.local has these values"
  exit 1
fi

cd packages/loader

echo "Loading dishes for location: $LOCATION"
echo "Radius: $RADIUS meters"
[ -n "$KEYWORD" ] && echo "Keyword: $KEYWORD"
[ -n "$REGION_ID" ] && echo "Region ID: $REGION_ID"
echo "[+] Additional flags: ${EXTRA_ARGS[*]:-"(none)"}"
echo ""

node dist/cli.js --location "$LOCATION" --radius "$RADIUS" \
  ${KEYWORD:+--keyword "$KEYWORD"} \
  ${REGION_ID:+--region-id "$REGION_ID"} \
  "${EXTRA_ARGS[@]}"


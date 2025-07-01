#!/bin/sh

# Default values
PORT=${PORT:-80}
LINKDING_BASE_URL=${LINKDING_BASE_URL:-""}
LINKDING_API_TOKEN=${LINKDING_API_TOKEN:-""}
CF_ACCESS_CLIENT_ID=${CF_ACCESS_CLIENT_ID:-""}
CF_ACCESS_CLIENT_SECRET=${CF_ACCESS_CLIENT_SECRET:-""}

# Extract hostname from URL
LINKDING_HOST=$(echo "$LINKDING_BASE_URL" | sed -e 's|^[^/]*//||' -e 's|/.*$||' -e 's|:.*$||')

# Validate required variables
if [ -z "$LINKDING_BASE_URL" ] || [ -z "$LINKDING_API_TOKEN" ]; then
    echo "Error: LINKDING_BASE_URL and LINKDING_API_TOKEN are required"
    exit 1
fi

echo "Starting nginx with configuration:"
echo "- Port: $PORT"
echo "- Linkding URL: $LINKDING_BASE_URL"
echo "- Linkding Host: $LINKDING_HOST"

# Export variables for envsubst
export PORT LINKDING_BASE_URL LINKDING_HOST LINKDING_API_TOKEN CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET

# Generate nginx config from template
envsubst '${PORT} ${LINKDING_BASE_URL} ${LINKDING_HOST} ${LINKDING_API_TOKEN} ${CF_ACCESS_CLIENT_ID} ${CF_ACCESS_CLIENT_SECRET}' \
    < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Test configuration
nginx -t

# Start nginx
exec nginx -g 'daemon off;'
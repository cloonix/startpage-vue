#!/bin/sh
set -e

# Default values
PORT=${PORT:-80}
LINKDING_BASE_URL=${LINKDING_BASE_URL:-""}
LINKDING_API_TOKEN=${LINKDING_API_TOKEN:-""}
P_ACCESS_TOKEN_ID=${P_ACCESS_TOKEN_ID:-""}
P_ACCESS_TOKEN=${P_ACCESS_TOKEN:-""}

# Validate required variables
if [ -z "$LINKDING_BASE_URL" ] || [ -z "$LINKDING_API_TOKEN" ]; then
    echo "Error: LINKDING_BASE_URL and LINKDING_API_TOKEN are required" >&2
    exit 1
fi

# Validate URL format
if ! echo "$LINKDING_BASE_URL" | grep -Eq '^https?://'; then
    echo "Error: LINKDING_BASE_URL must start with http:// or https://" >&2
    echo "Provided: $LINKDING_BASE_URL" >&2
    exit 1
fi

# Validate token is not placeholder
if echo "$LINKDING_API_TOKEN" | grep -q "your_.*_here"; then
    echo "Error: LINKDING_API_TOKEN appears to be a placeholder value" >&2
    echo "Please update .env with your actual Linkding API token" >&2
    exit 1
fi

# Validate URL is not placeholder
if echo "$LINKDING_BASE_URL" | grep -q "your_.*_here"; then
    echo "Error: LINKDING_BASE_URL appears to be a placeholder value" >&2
    echo "Please update .env with your actual Linkding instance URL" >&2
    exit 1
fi

# Warn if Proxy Access is partially configured
if [ -n "$P_ACCESS_TOKEN_ID" ] && [ -z "$P_ACCESS_TOKEN" ] || \
   [ -z "$P_ACCESS_TOKEN_ID" ] && [ -n "$P_ACCESS_TOKEN" ]; then
    echo "Warning: Proxy Access requires both P_ACCESS_TOKEN_ID and P_ACCESS_TOKEN" >&2
    echo "Only one is set - Proxy authentication will not work properly" >&2
fi

# Extract hostname from URL
LINKDING_HOST=$(echo "$LINKDING_BASE_URL" | sed -e 's|^[^/]*//||' -e 's|/.*$||' -e 's|:.*$||')

# Validate hostname extraction
if [ -z "$LINKDING_HOST" ]; then
    echo "Error: Failed to extract hostname from LINKDING_BASE_URL" >&2
    echo "URL: $LINKDING_BASE_URL" >&2
    exit 1
fi

echo "Starting nginx with configuration:"
echo "- Port: $PORT"
echo "- Linkding URL: $LINKDING_BASE_URL"
echo "- Linkding Host: $LINKDING_HOST"
echo "- Proxy Access: ${P_ACCESS_TOKEN_ID:+Enabled}"

# Export variables for envsubst
export PORT LINKDING_BASE_URL LINKDING_HOST LINKDING_API_TOKEN P_ACCESS_TOKEN_ID P_ACCESS_TOKEN

# Generate nginx config from template
envsubst '${PORT} ${LINKDING_BASE_URL} ${LINKDING_HOST} ${LINKDING_API_TOKEN} ${P_ACCESS_TOKEN_ID} ${P_ACCESS_TOKEN}' \
    < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Test configuration
if ! nginx -t; then
    echo "Error: nginx configuration test failed" >&2
    echo "Generated config:" >&2
    cat /etc/nginx/nginx.conf >&2
    exit 1
fi

# Start nginx
exec nginx -g 'daemon off;'

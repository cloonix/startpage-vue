#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Check if git repo exists before pulling
if [ -d .git ]; then
    echo "Pulling latest changes from git..."
    if ! git pull origin main; then
        echo -e "${YELLOW}Warning: git pull failed, continuing with local version${NC}" >&2
    fi
else
    echo -e "${YELLOW}Warning: Not a git repository, skipping git pull${NC}" >&2
fi

# Safely load environment variables from .env file
if [ -f .env ]; then
    # Use source instead of xargs for safety
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
else
    echo -e "${RED}Error: .env file not found${NC}" >&2
    echo "Please copy .env.example to .env and configure your settings" >&2
    exit 1
fi

# Validate required environment variables
: "${LINKDING_BASE_URL:?Error: LINKDING_BASE_URL not set in .env}"
: "${LINKDING_API_TOKEN:?Error: LINKDING_API_TOKEN not set in .env}"

# Check for placeholder values
if echo "$LINKDING_BASE_URL" | grep -q "your_.*_here"; then
    echo -e "${RED}Error: LINKDING_BASE_URL appears to be a placeholder value${NC}" >&2
    echo "Please update .env with your actual Linkding URL" >&2
    exit 1
fi

if echo "$LINKDING_API_TOKEN" | grep -q "your_.*_here"; then
    echo -e "${RED}Error: LINKDING_API_TOKEN appears to be a placeholder value${NC}" >&2
    echo "Please update .env with your actual Linkding API token" >&2
    exit 1
fi

# Generate content hashes for cache busting (use sha256 for better security)
APP_HASH=$(sha256sum app/app.js | cut -d' ' -f1 | cut -c1-16)
CSS_HASH=$(sha256sum app/styles.css | cut -d' ' -f1 | cut -c1-16)
export APP_HASH CSS_HASH

# Generate version string from git
if [ -d .git ]; then
    VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')")
else
    VERSION="dev-$(date +%Y%m%d)"
fi
export VERSION

echo -e "${GREEN}Building startpage-vue...${NC}"
echo "- Linkding URL: $LINKDING_BASE_URL"
echo "- Port: ${PORT:-3000}"
echo "- Version: $VERSION"
echo "- App.js hash: $APP_HASH"
echo "- CSS hash: $CSS_HASH"

# Build and run with docker-compose, passing build arguments
docker compose build --build-arg APP_HASH="$APP_HASH" --build-arg CSS_HASH="$CSS_HASH" --build-arg VERSION="$VERSION"
docker compose up -d

echo -e "${GREEN}Container started successfully!${NC}"
echo "Access your startpage at: http://localhost:${PORT:-3000}"

#!/bin/bash

# Pull latest changes from git
git pull origin main

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Generate content hash of app.js for cache busting
export APP_HASH=$(md5sum app/app.js | awk '{print $1}')

# Replace placeholder in index.html
sed -i.bak "s/APP_HASH/$APP_HASH/g" app/index.html

echo "Building startpage-vue..."
echo "- Linkding URL: $LINKDING_BASE_URL"
echo "- Port: ${PORT:-3000}"
echo "- App.js hash: $APP_HASH"

# Build and run with docker-compose
docker compose up --build -d

echo "Container started successfully!"
echo "Access your startpage at: http://localhost:${PORT:-3000}"
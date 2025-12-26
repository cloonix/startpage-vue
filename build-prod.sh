#!/bin/bash

# Production build script for startpage-vue
# This script ensures proper cache busting and fresh deployments

set -e

echo "🔄 Starting production build..."

# Navigate to project directory
cd /home/claus/git/startpage-vue

# Pull latest changes from repository
echo "📥 Pulling latest changes..."
git pull origin main

# Generate cache-busting hashes
echo "🔨 Generating cache-busting hashes..."
export APP_HASH=$(md5sum app/app.js | cut -d' ' -f1)
export CSS_HASH=$(md5sum app/styles.css | cut -d' ' -f1)
export VERSION="prod-$(date +%Y%m%d-%H%M%S)"

echo "Generated hashes:"
echo "  APP_HASH: $APP_HASH"
echo "  CSS_HASH: $CSS_HASH"
echo "  VERSION: $VERSION"

# Stop existing container
echo "🛑 Stopping existing container..."
docker compose --profile prod down 2>/dev/null || true

# Remove old images to force rebuild
echo "🗑️  Removing old images..."
docker image prune -f
docker rmi startpage-vue-startpage-prod 2>/dev/null || true

# Build and start new container with production profile
echo "🚀 Building and starting new container with production profile..."
docker compose --profile prod up --build -d

# Wait for container to be healthy
echo "⏳ Waiting for container to be healthy..."
sleep 10

# Check if container is running
if docker ps | grep -q startpage-prod; then
    echo "✅ Production build completed successfully!"
    echo "🌐 Service available at: http://localhost:81"
    
    # Show container logs for verification
    echo "📋 Recent container logs:"
    docker logs startpage-prod --tail 20
else
    echo "❌ Build failed - container is not running"
    echo "📋 Container logs:"
    docker logs startpage-prod --tail 50
    exit 1
fi
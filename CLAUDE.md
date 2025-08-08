# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vue Startpage is a lightweight, self-hosted startpage that integrates with Linkding for bookmark management. The application is built with minimal dependencies using pure Vue.js 3 (no build process) and served via nginx in a Docker container.

## Development Commands

### Building and Running
- `./build.sh` - Builds and deploys the application using Docker Compose (pulls latest changes, generates cache hash, builds container)
- `docker compose up --build -d` - Build and run container in detached mode
- `docker compose down` - Stop the container
- `docker compose logs -f startpage-vue` - View container logs

### Manual Development
- No build process required - the application uses pure Vue.js 3 from CDN
- Edit files directly in the `app/` directory
- The nginx configuration includes cache-busting via MD5 hash of `app.js`

## Architecture

### Frontend Structure
- **Single Page Application**: Pure Vue.js 3 application with no build step
- **Main Files**:
  - `app/index.html` - Main HTML template with Vue.js app mounting point
  - `app/app.js` - Complete Vue.js application logic (225 lines)
  - `app/favicon.ico` - Application icon

### Backend Architecture
- **Nginx Proxy**: Acts as reverse proxy to Linkding API, handling authentication
- **API Endpoints**: All requests to `/api/` are proxied to Linkding with automatic token injection
- **Static Serving**: Optimized caching for static assets (7 days) and HTML (1 hour)

### Container Structure
- **Base Image**: nginx:alpine
- **Environment Variables**: Linkding URL, API token, optional Cloudflare Access credentials
- **Health Check**: `/health` endpoint returns JSON status
- **Cache Busting**: APP_HASH environment variable for JavaScript file versioning

## Key Components

### Vue.js Application (`app/app.js`)
- **Search System**: Debounced search with scoring (title matches prioritized over tag matches)
- **Static Bookmarks**: Two sections loaded on startup:
  - Top section: `#startpage-top` tagged bookmarks in grid layout
  - Bottom section: `#startpage-bottom` tagged bookmarks grouped by additional tags
- **Keyboard Navigation**: Full arrow key navigation, Enter to open, Escape to reset
- **Icon System**: Custom icons via `icon::URL` in bookmark notes field

### Configuration Files
- **nginx.conf.template**: Nginx configuration with environment variable substitution
- **docker-compose.yml**: Container orchestration with environment variable mapping
- **Dockerfile**: Multi-stage build with cache busting support
- **entrypoint.sh**: Container startup script for environment variable substitution

## Integration Points

### Linkding API
- Authentication via `Authorization: Token` header (injected by nginx)
- Bookmark fetching with pagination support (limit: 100)
- Tag-based filtering for static sections
- Icon extraction from notes field using `icon::` prefix

### Environment Variables
Required:
- `LINKDING_BASE_URL` - Base URL of Linkding instance
- `LINKDING_API_TOKEN` - API token from Linkding settings
- `PORT` - Port for web interface (default: 3000)

Optional:
- `CF_ACCESS_CLIENT_ID` - Cloudflare Access client ID
- `CF_ACCESS_CLIENT_SECRET` - Cloudflare Access client secret

## Performance Optimizations

### Caching Strategy
- Static files cached for 7 days with immutable headers
- HTML cached for 1 hour with must-revalidate
- API responses cached for 2 minutes
- Content-based cache busting using MD5 hash of app.js

### Search Optimization
- 200ms debounced search to prevent excessive API calls
- Relevance scoring prioritizes title matches over tag matches
- Efficient Vue.js rendering with unique keys for list items

### Network Optimization
- Gzip compression enabled for text/javascript/css
- Keep-alive connections with nginx
- Preconnect to placeholder icon service
- Lazy loading for bookmark icons
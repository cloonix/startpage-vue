# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vue Startpage is a lightweight, self-hosted startpage that integrates with Linkding for bookmark management. The application is built with minimal dependencies using pure Vue.js 3 (no build process) and Tailwind CSS (browser edition) served via nginx in a Docker container.

## Development Commands

### Building and Running
- `./build.sh` - Builds and deploys the application using Docker Compose (pulls latest changes, generates cache hash, builds container)
- `docker compose up --build -d` - Build and run container in detached mode
- `docker compose down` - Stop the container
- `docker compose logs -f startpage-vue` - View container logs

### Manual Development
- No build process required - the application uses pure Vue.js 3 and Tailwind CSS from CDN
- Edit files directly in the `app/` directory
- The nginx configuration includes cache-busting via MD5 hash of `app.js`
- Cache hash is automatically replaced during build via `build.sh`

## Architecture

### Frontend Structure
- **Single Page Application**: Pure Vue.js 3 application with no build step
- **Styling**: Tailwind CSS browser edition for utility-first styling + CSS variables for dark theme
- **Main Files**:
  - `app/index.html` - Main HTML template with Vue.js app mounting point (292 lines)
  - `app/app.js` - Complete Vue.js application logic (280 lines)
  - `app/favicon.ico` - Application icon

### Backend Architecture
- **Nginx Proxy**: Acts as reverse proxy to Linkding API, handling authentication and SSL
- **API Endpoints**: All requests to `/api/` are proxied to Linkding with automatic token injection
- **Static Serving**: Optimized caching for static assets (7 days) and HTML (1 hour)
- **Security**: Essential security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)

### Container Structure
- **Base Image**: nginx:alpine
- **Environment Variables**: Linkding URL, API token, optional Cloudflare Access credentials
- **Health Check**: `/health` endpoint returns JSON status
- **Cache Busting**: APP_HASH environment variable for JavaScript file versioning

## Key Components

### Vue.js Application (`app/app.js`)
- **Search System**: Simplified debounced search with basic relevance scoring
- **Progressive Loading**: Sections load independently with skeleton loading states
- **Static Bookmarks**: Two sections loaded on startup:
  - Top section: `#startpage-top` tagged bookmarks in unified grid layout
  - Bottom section: `#startpage-bottom` tagged bookmarks grouped by additional tags
- **Keyboard Navigation**: Full arrow key navigation, Enter to open, Escape to reset
- **Icon System**: Custom icons via `icon::URL` in bookmark notes field with favicon fallbacks
- **Icon Caching**: In-memory Map-based icon URL caching for performance
- **Error Handling**: Comprehensive error handling with user-friendly messages

### Dark Theme Implementation
- **CSS Variables**: Complete dark theme using CSS custom properties in `:root`
- **Color Palette**: Carefully selected dark theme colors for optimal contrast
- **Component Styling**: All components styled with CSS variables for consistent theming
- **Responsive Design**: Theme works seamlessly across all breakpoints

### Responsive Grid System
- **Unified Layout**: Single responsive grid system for both top and bottom sections
- **Breakpoints**: 
  - Desktop (default): 6 columns (120px min)
  - Large tablets (≤1199px): 5 columns (90px min)
  - Tablets (≤767px): 4 columns (65px min)
  - Mobile (≤480px): 6 columns (35px min, icons only)
- **Adaptive Design**: Text labels hidden on mobile, icons centered

### Configuration Files
- **nginx.conf.template**: Nginx configuration with environment variable substitution and SSL optimizations
- **docker-compose.yml**: Container orchestration with environment variable mapping and IPv6 disabled
- **Dockerfile**: Multi-stage build with cache busting support and HTML preprocessing
- **entrypoint.sh**: Container startup script with validation and configuration generation
- **build.sh**: Build script handling git updates, cache hash generation, and deployment

## Integration Points

### Linkding API
- Authentication via `Authorization: Token` header (injected by nginx)
- Bookmark fetching with pagination support (limit: 50-100)
- Tag-based filtering for static sections using `q=#tagname` search
- Icon extraction from notes field using `icon::` prefix
- Comprehensive error handling for connection and authentication issues

### Environment Variables
Required:
- `LINKDING_BASE_URL` - Base URL of Linkding instance
- `LINKDING_API_TOKEN` - API token from Linkding settings
- `PORT` - Port for web interface (default: 3000)

Optional:
- `CF_ACCESS_CLIENT_ID` - Cloudflare Access client ID
- `CF_ACCESS_CLIENT_SECRET` - Cloudflare Access client secret

## Performance Optimizations

### Progressive Loading Strategy
- **Skeleton Loading**: Animated skeleton placeholders for all sections
- **Prioritized Loading**: Top section loads first (most important), bottom section after 100ms delay
- **Background Search**: Full bookmark search loads after 200ms to avoid blocking UI
- **Icon Preloading**: First 8 icons preloaded for visible bookmarks

### Caching Strategy
- **Static Files**: 7 days cache with immutable headers for JS/CSS/images
- **HTML**: 1 hour cache with must-revalidate for dynamic content
- **API Responses**: 2 minutes cache for bookmark API responses
- **Content Hash**: MD5-based cache busting for JavaScript files
- **Icon Caching**: In-memory Map-based caching for icon URLs

### Search Optimization
- **Debounced Search**: 200ms debounce to prevent excessive API calls
- **Minimum Query Length**: Search only triggers for queries ≥2 characters
- **Simplified Scoring**: Basic relevance scoring (exact match > starts-with > alphabetical)
- **Efficient Filtering**: Client-side filtering with optimized array operations
- **Highlighted Results**: Real-time text highlighting in search results

### Network Optimization
- **Gzip Compression**: Enabled for all text-based content types
- **Keep-Alive**: Persistent connections with optimized timeouts
- **Preconnect**: DNS preconnect to placeholder icon service
- **Lazy Loading**: Deferred loading for bookmark icons
- **SSL Optimizations**: Optimized proxy SSL settings for external APIs
- **Connection Pooling**: Optimized proxy timeouts (10s connect/send/read)

### UI/UX Performance
- **Minimal Layout Shift**: Fixed heights and skeleton loading prevent CLS
- **Smooth Animations**: CSS transitions with optimized timing (0.15s)
- **Hover States**: Enhanced visual feedback with transform and shadows
- **Keyboard Navigation**: Efficient keyboard handling with proper focus management
- **Error States**: Clear error messaging with retry capabilities
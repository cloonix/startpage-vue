FROM nginx:alpine

# Build arguments for cache busting and versioning
ARG APP_HASH=dev
ARG CSS_HASH=dev
ARG VERSION=dev

# Install dependencies and setup in single layer
RUN apk add --no-cache gettext && \
    rm -rf /var/cache/apk/*

# Copy configuration files (least frequently changed first for better caching)
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY entrypoint.sh /entrypoint.sh

# Copy static files (changes more frequently)
COPY app/ /usr/share/nginx/html/

# Set executable permission, create version.json, and replace placeholders in single RUN to reduce layers
RUN chmod +x /entrypoint.sh && \
    echo "{\"version\":\"${VERSION}\",\"app_hash\":\"${APP_HASH}\",\"css_hash\":\"${CSS_HASH}\"}" > /usr/share/nginx/html/version.json && \
    find /usr/share/nginx/html -type f \( -name "*.html" -o -name "*.css" \) -exec \
    sed -i \
        -e "s/APP_HASH/${APP_HASH}/g" \
        -e "s/CSS_HASH/${CSS_HASH}/g" {} \+

# Set environment variables
ENV APP_HASH=${APP_HASH} \
    CSS_HASH=${CSS_HASH} \
    VERSION=${VERSION}

# Health check to ensure nginx is responding
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
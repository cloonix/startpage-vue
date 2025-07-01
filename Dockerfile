FROM nginx:alpine

# Install envsubst for environment variable substitution
RUN apk add --no-cache gettext

# Copy static files
COPY app/ /usr/share/nginx/html/

# Copy nginx template
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Build argument for cache busting
ARG APP_HASH
ENV APP_HASH=${APP_HASH}

# Replace APP_HASH in HTML files
RUN find /usr/share/nginx/html -name "*.html" -type f -exec \
    sed -i "s/APP_HASH/${APP_HASH}/g" {} \;

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
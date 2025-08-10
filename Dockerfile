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

# Build arguments for cache busting and versioning
ARG APP_HASH
ARG CSS_HASH
ARG VERSION
ENV APP_HASH=${APP_HASH}
ENV CSS_HASH=${CSS_HASH}
ENV VERSION=${VERSION}

# Replace placeholders in files
RUN find /usr/share/nginx/html -name "*.html" -type f -exec \
    sed -i -e "s/APP_HASH/${APP_HASH}/g" -e "s/CSS_HASH/${CSS_HASH}/g" -e "s/VERSION_PLACEHOLDER/${VERSION}/g" {} \; && \
    find /usr/share/nginx/html -name "*.css" -type f -exec \
    sed -i "s/APP_HASH/${APP_HASH}/g" {} \;

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
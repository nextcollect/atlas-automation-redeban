# Use Node.js Alpine for minimal vulnerabilities
FROM node:22-alpine

WORKDIR /usr/src/app

# Install system dependencies for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl \
    # Create shared memory directory
    && mkdir -p /tmp && chmod 1777 /tmp \
    # Update package index and upgrade all packages to fix CVE-2025-57052 (cJSON) and CVE-2025-64118 (tar)
    && apk update \
    && apk upgrade --no-cache \
    && apk upgrade --no-cache busybox \
    && apk upgrade --no-cache pcre2 \
    # Explicitly upgrade cJSON to patch CVE-2025-57052
    && apk upgrade --no-cache cjson \
    # Upgrade tar to patch CVE-2025-64118
    && apk upgrade --no-cache tar

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Set environment for Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=true \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_TLS_REJECT_UNAUTHORIZED=0

# Add version file with Alpine marker
RUN echo "{\"version\": \"$(date +%Y%m%d%H%M%S)\", \"buildDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\", \"base\": \"alpine\"}" > version.json

# Start the automation
CMD ["node", "src/redeban.js"]
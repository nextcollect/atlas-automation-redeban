# Use Node.js Alpine for minimal vulnerabilities
FROM node:24.10.0-alpine3.22

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
    && apk upgrade --no-cache \
    && apk upgrade --no-cache busybox

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
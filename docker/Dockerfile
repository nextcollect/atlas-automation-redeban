# Use Node.js Alpine for minimal vulnerabilities
FROM node:22-alpine

WORKDIR /usr/src/app

# Install system dependencies for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl \
    && apk upgrade --no-cache openssl

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
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Add version file
RUN echo "{\"version\": \"$(date +%Y%m%d%H%M%S)\", \"buildDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" > version.json

# Start the automation
CMD ["node", "src/redeban.js"]
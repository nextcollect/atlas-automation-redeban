# Use official Playwright image with pre-installed browsers
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /usr/src/app

# Install curl and apply all security updates
RUN apt-get update && apt-get install -y \
    curl \
    && apt-get upgrade -y \
    && apt-get dist-upgrade -y \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install Playwright browsers (already optimized in this image)
RUN npx playwright install --with-deps

# Add version file
RUN echo "{\"version\": \"$(date +%Y%m%d%H%M%S)\", \"buildDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" > version.json

# Start the automation
CMD ["node", "src/redeban.js"]
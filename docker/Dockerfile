# Use Node.js 24 official image (Debian-based, more secure than busybox)
FROM node:24-slim

WORKDIR /usr/src/app

# Install system dependencies for Playwright (minimal working set)
RUN apt-get update && apt-get install -y \
    # Basic system tools
    curl \
    wget \
    gnupg \
    ca-certificates \
    # Core Playwright browser dependencies
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libxtst6 \
    # Audio dependencies
    libasound2 \
    # Font and rendering dependencies
    fonts-liberation \
    fontconfig \
    # Additional GUI dependencies
    libappindicator3-1 \
    xdg-utils \
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

# Install Playwright browsers and dependencies
RUN npx playwright install --with-deps chromium

# Add version file
RUN echo "{\"version\": \"$(date +%Y%m%d%H%M%S)\", \"buildDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" > version.json

# Start the automation
CMD ["node", "src/redeban.js"]
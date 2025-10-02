# Use Node.js with Chrome for better Puppeteer compatibility in Fargate
FROM node:18-slim

WORKDIR /usr/src/app

# Install dependencies for Puppeteer and Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libgconf-2-4 \
    libxkbcommon0 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrender1 \
    libxtst6 \
    libglib2.0-0 \
    libnss3 \
    libxss1 \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
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
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Add version file
RUN echo "{\"version\": \"$(date +%Y%m%d%H%M%S)\", \"buildDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" > version.json

# Create a non-root user for security
RUN groupadd -r automation && useradd -r -g automation -G audio,video automation \
    && mkdir -p /home/automation/Downloads \
    && chown -R automation:automation /home/automation \
    && chown -R automation:automation /usr/src/app

# Switch to non-root user
USER automation

# Command to test proxy first, then run automation
CMD ["node", "src/test-proxy-nodejs.js"]
FROM mcr.microsoft.com/playwright:v1.43.1-jammy
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm install
CMD ["node", "redeban.js"]

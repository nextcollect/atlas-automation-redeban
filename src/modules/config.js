/**
 * Configuration Module for Redeban Automation
 *
 * Centralizes all configuration settings including site URLs, credentials,
 * proxy settings, AWS S3 configuration, and browser options.
 * Automatically loads environment variables via dotenv.
 *
 * @author Atlas Automation Team
 * @version 1.0.0
 * @module config
 */

require('dotenv').config();

/**
 * Main configuration object containing all settings for Redeban automation
 * @type {Object}
 * @property {string} siteUrl - Redeban login page URL
 * @property {string} username - Site login username from environment
 * @property {string} password - Site login password from environment
 * @property {string} proxyHost - Oxylabs proxy host
 * @property {string} proxyPort - Oxylabs proxy port
 * @property {string} proxyUsername - Proxy authentication username
 * @property {string} proxyPassword - Proxy authentication password
 * @property {string} s3BucketInput - S3 bucket for input files
 * @property {string} s3KeyInput - S3 key for input file
 * @property {string} s3BucketEvidence - S3 bucket for evidence/screenshots
 * @property {string} s3KeyPrefix - S3 key prefix for organizing files
 * @property {Object} browserOptions - Playwright browser launch options
 */
const config = {
  siteUrl: process.env.SITE_URL || 'https://pagosrecurrentes.redebandigital.com/pages/authentication/login-v1',
  username: process.env.SITE_USERNAME || 'lguio@unicef.org',
  password: process.env.SITE_PASSWORD || 'Unicef.20250629*',
  // Proxy settings - Oxylabs residential proxy for IP bypass
  useProxy: process.env.USE_PROXY === 'true' || true, // Force proxy usage to bypass IP blocking
  proxyHost: process.env.PROXY_HOST || 'pr.oxylabs.io',
  proxyPort: process.env.PROXY_PORT || '7777',
  proxyUsername: process.env.PROXY_USERNAME, // From SSM: /atlas/redeban/proxy-username
  proxyPassword: process.env.PROXY_PASSWORD, // From SSM: /atlas/redeban/proxy-password
  s3BucketInput: process.env.S3_BUCKET_INPUT,
  s3KeyInput: process.env.S3_KEY_INPUT,
  s3BucketEvidence: process.env.S3_BUCKET_EVIDENCE,
  s3KeyPrefix: process.env.S3_KEY_PREFIX,
  // Playwright configuration for browser automation
  browserOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--ignore-ssl-errors',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-translate',
      '--disable-windows10-custom-titlebar',
      '--metrics-recording-only',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-component-extensions-with-background-pages',
      '--disable-extensions',
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-ipc-flooding-protection',
      // AWS Fargate specific flags
      '--single-process',
      '--no-zygote',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-accelerated-2d-canvas',
      '--disable-accelerated-jpeg-decoding',
      '--disable-accelerated-mjpeg-decode',
      '--disable-accelerated-video-decode',
      '--disable-accelerated-video-encode',
      '--disable-app-list-dismiss-on-blur',
      '--disable-audio-output',
      '--memory-pressure-off'
    ]
  }
};

module.exports = config;
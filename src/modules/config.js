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
  proxyHost: process.env.PROXY_HOST || 'pr.oxylabs.io',
  proxyPort: process.env.PROXY_PORT || '7777',
  proxyUsername: process.env.PROXY_USERNAME || 'customer-sroma29_uP9v3-cc-co-city-bucaramanga-sessid-0292027377-sesstime-6',
  proxyPassword: process.env.PROXY_PASSWORD || '728hv_b8XjfCr',
  s3BucketInput: process.env.S3_BUCKET_INPUT,
  s3KeyInput: process.env.S3_KEY_INPUT,
  s3BucketEvidence: process.env.S3_BUCKET_EVIDENCE,
  s3KeyPrefix: process.env.S3_KEY_PREFIX,
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
      '--ignore-ssl-errors'
    ]
  }
};

module.exports = config;
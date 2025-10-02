/**
 * Debug script to test both Node.js and Puppeteer connectivity
 * This will help us understand the difference in Fargate
 */

const https = require('https');
const { log } = require('./modules/logger');

/**
 * Test pure Node.js connectivity
 */
async function testNodeJSConnectivity(url) {
  return new Promise((resolve, reject) => {
    log(`🔍 Testing Node.js connectivity to: ${url}`, 'info');

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
        'Connection': 'close'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      log(`✅ Node.js Status: ${res.statusCode}`, 'success');

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const hasTitle = data.includes('Pagos Recurrentes');
        log(`📄 Node.js Title found: ${hasTitle}`, 'info');
        log(`📦 Node.js Content length: ${data.length} bytes`, 'info');
        resolve({
          success: true,
          statusCode: res.statusCode,
          hasTitle,
          contentLength: data.length,
          engine: 'nodejs'
        });
      });
    });

    req.on('error', (err) => {
      log(`❌ Node.js error: ${err.message}`, 'error');
      resolve({
        success: false,
        error: err.message,
        engine: 'nodejs'
      });
    });

    req.on('timeout', () => {
      log(`❌ Node.js timeout`, 'error');
      req.destroy();
      resolve({
        success: false,
        error: 'Timeout',
        engine: 'nodejs'
      });
    });

    req.end();
  });
}

/**
 * Test Puppeteer connectivity
 */
async function testPuppeteerConnectivity(url) {
  let browser = null;
  let page = null;

  try {
    log(`🔍 Testing Puppeteer connectivity to: ${url}`, 'info');

    const puppeteer = require('puppeteer');
    const config = require('./modules/config');

    browser = await puppeteer.launch({
      ...config.puppeteerOptions,
      // Add extra debugging
      args: [
        ...config.puppeteerOptions.args,
        '--enable-logging',
        '--log-level=0'
      ]
    });

    page = await browser.newPage();

    // Enable request interception for debugging
    await page.setRequestInterception(true);
    page.on('request', request => {
      log(`📤 Puppeteer request: ${request.method()} ${request.url()}`, 'info');
      request.continue();
    });

    page.on('response', response => {
      log(`📥 Puppeteer response: ${response.status()} ${response.url()}`, 'info');
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const statusCode = response.status();
    const title = await page.title();

    log(`✅ Puppeteer Status: ${statusCode}`, 'success');
    log(`📄 Puppeteer Title: ${title}`, 'info');

    return {
      success: true,
      statusCode,
      title,
      engine: 'puppeteer'
    };

  } catch (error) {
    log(`❌ Puppeteer error: ${error.message}`, 'error');
    return {
      success: false,
      error: error.message,
      engine: 'puppeteer'
    };
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

/**
 * Main debug function
 */
async function debugConnectivity() {
  const url = 'https://pagosrecurrentes.redebandigital.com/pages/authentication/login-v1';

  log('🚀 Starting connectivity debug...', 'step');
  log(`🌍 Target URL: ${url}`, 'info');
  log(`🐳 Environment: ${process.env.NODE_ENV || 'development'}`, 'info');
  log(`💾 Memory limit: ${process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 'N/A'}`, 'info');

  // Test 1: Node.js
  log('\n--- Test 1: Pure Node.js ---', 'step');
  const nodeResult = await testNodeJSConnectivity(url);
  log(`Node.js Result: ${JSON.stringify(nodeResult, null, 2)}`, 'info');

  // Test 2: Puppeteer
  log('\n--- Test 2: Puppeteer ---', 'step');
  const puppeteerResult = await testPuppeteerConnectivity(url);
  log(`Puppeteer Result: ${JSON.stringify(puppeteerResult, null, 2)}`, 'info');

  // Summary
  log('\n--- Summary ---', 'step');
  log(`Node.js works: ${nodeResult.success}`, nodeResult.success ? 'success' : 'error');
  log(`Puppeteer works: ${puppeteerResult.success}`, puppeteerResult.success ? 'success' : 'error');

  if (nodeResult.success && !puppeteerResult.success) {
    log('🔍 Node.js works but Puppeteer fails - this is a browser/Chrome issue', 'warning');
    log('💡 Possible solutions:', 'info');
    log('   1. Use a different Chrome binary', 'info');
    log('   2. Add more Chrome flags for networking', 'info');
    log('   3. Use headless Chrome directly instead of Puppeteer', 'info');
  } else if (!nodeResult.success && !puppeteerResult.success) {
    log('🔍 Both fail - this is a network/DNS issue in Fargate', 'error');
    log('💡 Check NAT Gateway, Security Groups, and DNS settings', 'info');
  }
}

// Run debug
debugConnectivity().catch(console.error);
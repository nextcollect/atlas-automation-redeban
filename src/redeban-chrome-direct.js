/**
 * Alternative approach using Chrome headless directly via child_process
 * Sometimes works better than Puppeteer in containerized environments
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { log } = require('./modules/logger');
const { generateRedebanProcessUUID } = require('./modules/utils');
const { uploadScreenshotToS3, writeMetadataToS3 } = require('./modules/s3Service');

/**
 * Test Chrome headless directly
 */
async function testChromeHeadless(url) {
  return new Promise((resolve, reject) => {
    log('🔍 Testing Chrome headless directly...', 'info');

    const chromePath = '/usr/bin/google-chrome-stable';
    const tempDir = '/tmp/chrome-test';
    const screenshotPath = '/tmp/chrome-test.png';

    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const chromeArgs = [
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--single-process',
      '--no-zygote',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--disable-web-security',
      '--user-data-dir=' + tempDir,
      '--window-size=1366,768',
      '--timeout=30000',
      `--screenshot=${screenshotPath}`,
      url
    ];

    log(`🚀 Executing: ${chromePath} ${chromeArgs.join(' ')}`, 'info');

    const chrome = spawn(chromePath, chromeArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 45000
    });

    let stdout = '';
    let stderr = '';

    chrome.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    chrome.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    chrome.on('close', (code) => {
      log(`📄 Chrome exit code: ${code}`, 'info');
      log(`📤 Chrome stdout: ${stdout}`, 'info');
      if (stderr) log(`📥 Chrome stderr: ${stderr}`, 'warning');

      // Check if screenshot was created
      const screenshotExists = fs.existsSync(screenshotPath);
      log(`📸 Screenshot created: ${screenshotExists}`, screenshotExists ? 'success' : 'error');

      if (screenshotExists) {
        const stats = fs.statSync(screenshotPath);
        log(`📦 Screenshot size: ${stats.size} bytes`, 'info');
      }

      resolve({
        success: code === 0 && screenshotExists,
        exitCode: code,
        screenshotExists,
        stdout,
        stderr,
        engine: 'chrome-direct'
      });
    });

    chrome.on('error', (error) => {
      log(`❌ Chrome spawn error: ${error.message}`, 'error');
      resolve({
        success: false,
        error: error.message,
        engine: 'chrome-direct'
      });
    });

    // Set timeout
    setTimeout(() => {
      chrome.kill('SIGTERM');
      log('⏰ Chrome process timeout', 'warning');
    }, 45000);
  });
}

/**
 * Use Chrome DevTools Protocol directly
 */
async function testChromeDevTools(url) {
  return new Promise((resolve, reject) => {
    log('🔍 Testing Chrome with DevTools Protocol...', 'info');

    const chromePath = '/usr/bin/google-chrome-stable';
    const tempDir = '/tmp/chrome-devtools';
    const port = 9222;

    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const chromeArgs = [
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--ignore-certificate-errors',
      '--disable-web-security',
      '--user-data-dir=' + tempDir,
      '--remote-debugging-port=' + port,
      '--remote-debugging-address=0.0.0.0'
    ];

    log(`🚀 Starting Chrome with DevTools: ${chromePath}`, 'info');

    const chrome = spawn(chromePath, chromeArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    chrome.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Wait for Chrome to start, then test DevTools API
    setTimeout(async () => {
      try {
        const http = require('http');

        // Get list of pages
        const options = {
          hostname: 'localhost',
          port: port,
          path: '/json/list',
          method: 'GET'
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const pages = JSON.parse(data);
              log(`📄 DevTools pages: ${pages.length}`, 'info');

              chrome.kill('SIGTERM');
              resolve({
                success: pages.length > 0,
                pages: pages.length,
                stderr,
                engine: 'chrome-devtools'
              });
            } catch (e) {
              chrome.kill('SIGTERM');
              resolve({
                success: false,
                error: 'Failed to parse DevTools response',
                stderr,
                engine: 'chrome-devtools'
              });
            }
          });
        });

        req.on('error', (err) => {
          log(`❌ DevTools API error: ${err.message}`, 'error');
          chrome.kill('SIGTERM');
          resolve({
            success: false,
            error: err.message,
            stderr,
            engine: 'chrome-devtools'
          });
        });

        req.end();

      } catch (error) {
        chrome.kill('SIGTERM');
        resolve({
          success: false,
          error: error.message,
          engine: 'chrome-devtools'
        });
      }
    }, 3000);

    chrome.on('error', (error) => {
      log(`❌ Chrome DevTools spawn error: ${error.message}`, 'error');
      resolve({
        success: false,
        error: error.message,
        engine: 'chrome-devtools'
      });
    });
  });
}

/**
 * Main function to test all Chrome approaches
 */
async function testAllChromeApproaches() {
  const url = 'https://pagosrecurrentes.redebandigital.com/pages/authentication/login-v1';
  const processUUID = generateRedebanProcessUUID();

  log('🚀 Testing all Chrome approaches...', 'step');
  log(`📋 Process UUID: ${processUUID}`, 'info');

  // Write initial metadata
  await writeMetadataToS3('started', {
    url,
    startTime: new Date().toISOString(),
    test: 'chrome-approaches'
  }, processUUID);

  // Test 1: Chrome headless direct
  log('\n--- Test 1: Chrome Headless Direct ---', 'step');
  const directResult = await testChromeHeadless(url);
  log(`Direct Chrome Result: ${JSON.stringify(directResult, null, 2)}`, 'info');

  // Test 2: Chrome DevTools Protocol
  log('\n--- Test 2: Chrome DevTools Protocol ---', 'step');
  const devtoolsResult = await testChromeDevTools(url);
  log(`DevTools Result: ${JSON.stringify(devtoolsResult, null, 2)}`, 'info');

  // Summary
  log('\n--- Chrome Tests Summary ---', 'step');
  log(`Direct Chrome works: ${directResult.success}`, directResult.success ? 'success' : 'error');
  log(`DevTools Chrome works: ${devtoolsResult.success}`, devtoolsResult.success ? 'success' : 'error');

  await writeMetadataToS3('completed', {
    endTime: new Date().toISOString(),
    directResult,
    devtoolsResult,
    test: 'chrome-approaches'
  }, processUUID);

  if (directResult.success) {
    log('✅ Chrome direct approach works - we can build automation with this!', 'success');
  } else if (devtoolsResult.success) {
    log('✅ Chrome DevTools approach works - we can use CDP for automation!', 'success');
  } else {
    log('❌ All Chrome approaches failed - this is a deeper infrastructure issue', 'error');
  }
}

// Run if called directly
if (require.main === module) {
  testAllChromeApproaches().catch(console.error);
}

module.exports = {
  testChromeHeadless,
  testChromeDevTools,
  testAllChromeApproaches
};
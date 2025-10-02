/**
 * Hybrid Redeban Automation
 * Uses Node.js to verify connectivity, then tries different browser approaches
 * Falls back gracefully if browsers fail
 *
 * @author Atlas Automation Team
 * @version 3.0.0
 */

const https = require('https');
const { log } = require('./modules/logger');
const { generateRedebanProcessUUID } = require('./modules/utils');
const { uploadScreenshotToS3, writeMetadataToS3 } = require('./modules/s3Service');
const config = require('./modules/config');

/**
 * Test connectivity with Node.js HTTPS
 */
async function verifyNodeJSConnectivity(url) {
  return new Promise((resolve) => {
    log('🔍 Verificando conectividad base con Node.js...', 'step');

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
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
      log(`✅ Conectividad Node.js: ${res.statusCode}`, 'success');

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const hasLoginForm = data.includes('username') || data.includes('email') || data.includes('password');
        const hasTitle = data.includes('Pagos Recurrentes');

        resolve({
          success: true,
          statusCode: res.statusCode,
          hasTitle,
          hasLoginForm,
          canConnect: res.statusCode === 200 || res.statusCode === 403
        });
      });
    });

    req.on('error', (err) => {
      log(`❌ Error Node.js: ${err.message}`, 'error');
      resolve({ success: false, error: err.message, canConnect: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout', canConnect: false });
    });

    req.end();
  });
}

/**
 * Try Puppeteer with minimal configuration
 */
async function tryPuppeteerMinimal(url) {
  let browser = null;
  let page = null;

  try {
    log('🔍 Intentando Puppeteer con configuración mínima...', 'info');

    const puppeteer = require('puppeteer');

    // Minimal Puppeteer configuration
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ],
      timeout: 30000
    });

    page = await browser.newPage();
    await page.setDefaultTimeout(20000);

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });

    const statusCode = response.status();
    log(`✅ Puppeteer mínimo exitoso: ${statusCode}`, 'success');

    return { success: true, statusCode, engine: 'puppeteer-minimal' };

  } catch (error) {
    log(`❌ Puppeteer mínimo falló: ${error.message}`, 'error');
    return { success: false, error: error.message, engine: 'puppeteer-minimal' };
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

/**
 * Try Chrome direct command line
 */
async function tryChromeDirect(url) {
  return new Promise((resolve) => {
    log('🔍 Intentando Chrome directo...', 'info');

    const { spawn } = require('child_process');
    const fs = require('fs');

    const tempDir = '/tmp/chrome-direct';
    const screenshotPath = '/tmp/chrome-screenshot.png';

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
      '--user-data-dir=' + tempDir,
      '--window-size=1366,768',
      '--timeout=15000',
      `--screenshot=${screenshotPath}`,
      url
    ];

    const chrome = spawn('/usr/bin/google-chrome-stable', chromeArgs, {
      timeout: 25000
    });

    chrome.on('close', (code) => {
      const screenshotExists = fs.existsSync(screenshotPath);

      if (code === 0 && screenshotExists) {
        log(`✅ Chrome directo exitoso: ${code}`, 'success');
        resolve({ success: true, exitCode: code, screenshotExists, engine: 'chrome-direct' });
      } else {
        log(`❌ Chrome directo falló: ${code}`, 'error');
        resolve({ success: false, exitCode: code, screenshotExists, engine: 'chrome-direct' });
      }
    });

    chrome.on('error', (error) => {
      resolve({ success: false, error: error.message, engine: 'chrome-direct' });
    });

    // Timeout safety
    setTimeout(() => {
      chrome.kill('SIGTERM');
      resolve({ success: false, error: 'Timeout', engine: 'chrome-direct' });
    }, 25000);
  });
}

/**
 * Perform login using the working method
 */
async function performActualLogin(method, url, credentials, processUUID) {
  log(`🔐 Realizando login con método: ${method}`, 'step');

  if (method === 'puppeteer-minimal') {
    return await loginWithPuppeteer(url, credentials, processUUID);
  } else if (method === 'chrome-direct') {
    return await loginWithChromeDirect(url, credentials, processUUID);
  } else {
    throw new Error(`Método de login no soportado: ${method}`);
  }
}

/**
 * Login with Puppeteer
 */
async function loginWithPuppeteer(url, credentials, processUUID) {
  let browser = null;
  let page = null;

  try {
    const puppeteer = require('puppeteer');

    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome-stable',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
      timeout: 30000
    });

    page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Take screenshot
    await page.screenshot({ path: '/tmp/login-start.png', fullPage: true });

    // Find and fill login form
    await page.waitForSelector('input[type="email"], input[name="username"], #username', { timeout: 10000 });
    await page.type('input[type="email"], input[name="username"], #username', credentials.username);
    await page.type('input[type="password"], input[name="password"], #password', credentials.password);

    // Take screenshot before submit
    await page.screenshot({ path: '/tmp/login-filled.png', fullPage: true });

    // Submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
      page.click('button[type="submit"], input[type="submit"], .btn-login')
    ]);

    // Take screenshot after submit
    await page.screenshot({ path: '/tmp/login-after.png', fullPage: true });

    const currentUrl = page.url();
    const success = currentUrl.includes('dashboard') || currentUrl.includes('home');

    log(`${success ? '✅' : '❌'} Login Puppeteer: ${success}`, success ? 'success' : 'error');
    return { success, currentUrl, method: 'puppeteer' };

  } catch (error) {
    log(`❌ Error login Puppeteer: ${error.message}`, 'error');
    return { success: false, error: error.message, method: 'puppeteer' };
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

/**
 * Main automation function
 */
async function runHybridAutomation() {
  const processUUID = generateRedebanProcessUUID();
  const startTime = new Date();

  try {
    log('🚀 Iniciando automatización híbrida Redeban...', 'step');
    log(`📋 Process UUID: ${processUUID}`, 'info');

    // Write initial metadata
    await writeMetadataToS3('started', {
      siteUrl: config.siteUrl,
      username: config.username,
      startTime: startTime.toISOString(),
      approach: 'hybrid'
    }, processUUID);

    // Step 1: Verify base connectivity
    const connectivityCheck = await verifyNodeJSConnectivity(config.siteUrl);

    if (!connectivityCheck.canConnect) {
      throw new Error(`No hay conectividad de red: ${connectivityCheck.error}`);
    }

    log('✅ Conectividad de red confirmada', 'success');

    // Step 2: Try browser methods in order of preference
    let workingMethod = null;

    // Try Puppeteer minimal first
    const puppeteerResult = await tryPuppeteerMinimal(config.siteUrl);
    if (puppeteerResult.success) {
      workingMethod = 'puppeteer-minimal';
    }

    // If Puppeteer fails, try Chrome direct
    if (!workingMethod) {
      const chromeResult = await tryChromeDirect(config.siteUrl);
      if (chromeResult.success) {
        workingMethod = 'chrome-direct';
      }
    }

    if (!workingMethod) {
      throw new Error('Ningún método de navegador funcionó');
    }

    log(`✅ Método funcional encontrado: ${workingMethod}`, 'success');

    // Step 3: Perform actual login
    const loginResult = await performActualLogin(workingMethod, config.siteUrl, {
      username: config.username,
      password: config.password
    }, processUUID);

    if (loginResult.success) {
      log('🎉 Automatización híbrida completada exitosamente', 'success');

      await writeMetadataToS3('completed', {
        endTime: new Date().toISOString(),
        duration: new Date() - startTime,
        status: 'success',
        method: workingMethod,
        loginResult
      }, processUUID);
    } else {
      throw new Error(`Login falló con ${workingMethod}: ${loginResult.error}`);
    }

  } catch (error) {
    log(`❌ Error en automatización híbrida: ${error.message}`, 'error');

    await writeMetadataToS3('failed', {
      endTime: new Date().toISOString(),
      error: error.message,
      status: 'failed'
    }, processUUID);

    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runHybridAutomation().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  runHybridAutomation,
  verifyNodeJSConnectivity,
  tryPuppeteerMinimal,
  tryChromeDirect
};
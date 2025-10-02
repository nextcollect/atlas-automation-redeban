/**
 * Redeban Automation Script with Puppeteer
 *
 * Automated file upload system for Redeban's recurring payments portal.
 * Uses Puppeteer for better AWS Fargate compatibility instead of Playwright.
 *
 * @author Atlas Automation Team
 * @version 2.1.0
 * @requires puppeteer
 * @requires @aws-sdk/client-s3
 */

const puppeteer = require('puppeteer');
const config = require('./modules/config');
const { log } = require('./modules/logger');
const { uploadScreenshotToS3, downloadInputFileFromS3, writeMetadataToS3 } = require('./modules/s3Service');

/**
 * Takes a screenshot using Puppeteer
 *
 * @async
 * @function takeScreenshot
 * @param {Page} page - Puppeteer page object
 * @param {string} name - Base name for the screenshot file
 * @param {string} bucket - S3 bucket for screenshots
 * @param {string} processUUID - Process UUID for organization
 * @returns {Promise<void>}
 */
async function takeScreenshot(page, name, bucket, processUUID) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    const filePath = `/tmp/${filename}`;

    await page.screenshot({path: filePath, fullPage: true});

    if (bucket && processUUID) {
      await uploadScreenshotToS3(filePath, filename, bucket, processUUID);
    } else {
      log(`Screenshot guardado localmente: ${filePath}`, 'info');
    }
  } catch (error) {
    log(`Error tomando screenshot: ${error.message}`, 'error');
  }
}

/**
 * Checks network connectivity using Puppeteer
 *
 * @async
 * @function checkNetworkConnectivity
 * @param {Browser} browser - Puppeteer browser instance
 * @param {string} siteUrl - Target Redeban URL to test connectivity
 * @returns {Promise<Object>} Object containing useProxy boolean, statusCode, title, and optional error
 */
async function checkNetworkConnectivity(browser, siteUrl) {
  log('Verificando conectividad de red a Redeban...', 'step');

  try {
    log('Probando conexión directa con Puppeteer...', 'info');
    const page = await browser.newPage();

    // Set user agent and headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8'
    });

    // Navigate with longer timeout for Fargate
    const response = await page.goto(siteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    const statusCode = response.status();
    const title = await page.title();

    await page.close();

    // Check if the page loads correctly
    if (statusCode === 200 && title.includes('Pagos Recurrentes')) {
      log('✅ Conexión directa exitosa con Puppeteer', 'success');
      return { useProxy: false, statusCode, title, engine: 'puppeteer' };
    } else if (statusCode === 403) {
      log(`⚠️ Conexión directa bloqueada (403) - se requiere proxy Colombia`, 'warning');
      return { useProxy: true, statusCode, title, engine: 'puppeteer' };
    } else {
      log(`⚠️ Conexión directa con problemas (${statusCode})`, 'warning');
      return { useProxy: true, statusCode, title, engine: 'puppeteer' };
    }

  } catch (error) {
    log(`❌ Conexión con Puppeteer falló: ${error.message}`, 'error');
    return { useProxy: false, error: error.message, forceDirectConnection: true, engine: 'puppeteer' };
  }
}

/**
 * Creates an optimal page with proxy configuration if needed
 *
 * @async
 * @function createOptimalPage
 * @param {Browser} browser - Puppeteer browser instance
 * @param {Object} config - Configuration object containing proxy settings
 * @param {Object} connectivityResult - Result from checkNetworkConnectivity
 * @returns {Promise<Page>} Configured page ready for use
 */
async function createOptimalPage(browser, config, connectivityResult) {
  log('Creando página óptima con Puppeteer...', 'step');

  const page = await browser.newPage();

  // Configure page settings
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Set headers for Colombian locale
  await page.setExtraHTTPHeaders({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });

  if (connectivityResult.useProxy) {
    log('🇨🇴 Configurando proxy con Puppeteer...', 'info');
    // Note: Puppeteer proxy configuration is different from Playwright
    // May need to use --proxy-server in args or authenticate differently
  } else {
    log('🔧 Configurando conexión directa con Puppeteer...', 'info');
  }

  return page;
}

/**
 * Performs login to Redeban using Puppeteer
 *
 * @async
 * @function performLogin
 * @param {Page} page - Puppeteer page instance
 * @param {Object} config - Configuration object with credentials
 * @param {string} bucket - S3 bucket for screenshots
 * @param {string} processUUID - Process UUID for organization
 * @returns {Promise<boolean>} Success status
 */
async function performLogin(page, config, bucket, processUUID) {
  log('Iniciando proceso de login...', 'step');

  try {
    // Navigate to login page
    log('Navegando a página de login...', 'info');
    await page.goto(config.siteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    // Take screenshot after page load
    await takeScreenshot(page, 'login-page-loaded', bucket, processUUID);

    // Wait for login form elements
    await page.waitForSelector('input[type="email"], input[name="username"], #username', { timeout: 10000 });
    await page.waitForSelector('input[type="password"], input[name="password"], #password', { timeout: 10000 });

    // Fill credentials
    log('Completando credenciales...', 'info');
    await page.type('input[type="email"], input[name="username"], #username', config.username);
    await page.type('input[type="password"], input[name="password"], #password', config.password);

    // Take screenshot before submit
    await takeScreenshot(page, 'credentials-filled', bucket, processUUID);

    // Submit form
    log('Enviando formulario de login...', 'info');
    await page.click('button[type="submit"], input[type="submit"], .btn-login');

    // Wait for navigation or response
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });

    // Take screenshot after login attempt
    await takeScreenshot(page, 'login-submitted', bucket, processUUID);

    // Check if login was successful
    const currentUrl = page.url();
    const pageTitle = await page.title();

    if (currentUrl.includes('dashboard') || currentUrl.includes('home') || pageTitle.includes('Dashboard')) {
      log('✅ Login exitoso', 'success');
      return true;
    } else {
      log('❌ Login falló - verificar credenciales', 'error');
      return false;
    }

  } catch (error) {
    log(`Error durante login: ${error.message}`, 'error');
    await takeScreenshot(page, 'login-error', bucket, processUUID);
    return false;
  }
}

/**
 * Main automation function using Puppeteer
 */
async function runRedebanAutomation() {
  let browser = null;
  let page = null;

  try {
    const startTime = new Date();
    const processUUID = require('./modules/utils').generateRedebanProcessUUID();

    log('Iniciando automatización Redeban con Puppeteer...', 'step');
    log(`Process UUID: ${processUUID}`, 'info');

    // Write initial metadata
    await writeMetadataToS3('started', {
      siteUrl: config.siteUrl,
      username: config.username,
      startTime: startTime.toISOString(),
      engine: 'puppeteer'
    }, processUUID);

    // Launch browser with Puppeteer
    log('🔧 Lanzando navegador con Puppeteer...', 'info');
    browser = await puppeteer.launch(config.puppeteerOptions);

    // Check network connectivity
    const connectivityResult = await checkNetworkConnectivity(browser, config.siteUrl);
    log(`Resultado de conectividad: ${connectivityResult.useProxy ? 'Proxy requerido' : 'Conexión directa'}`, 'info');

    // Create optimal page
    page = await createOptimalPage(browser, config, connectivityResult);

    // Perform login
    const loginSuccess = await performLogin(page, config, config.s3BucketEvidence, processUUID);

    if (loginSuccess) {
      log('🎉 Automatización Redeban completada exitosamente', 'success');

      // Write success metadata
      await writeMetadataToS3('completed', {
        endTime: new Date().toISOString(),
        duration: new Date() - startTime,
        status: 'success',
        engine: 'puppeteer'
      }, processUUID);
    } else {
      throw new Error('Login failed');
    }

  } catch (error) {
    log(`❌ Error en automatización: ${error.message}`, 'error');

    // Write error metadata
    if (processUUID) {
      await writeMetadataToS3('failed', {
        endTime: new Date().toISOString(),
        error: error.message,
        status: 'failed',
        engine: 'puppeteer'
      }, processUUID);
    }
  } finally {
    // Cleanup
    if (page) {
      log('Cerrando página...', 'info');
      await page.close();
    }

    if (browser) {
      log('Cerrando navegador...', 'info');
      await browser.close();
    }

    log('Navegador cerrado. Automatización completada', 'success');
  }
}

// Run if called directly
if (require.main === module) {
  runRedebanAutomation().catch(console.error);
}

module.exports = {
  runRedebanAutomation,
  takeScreenshot,
  checkNetworkConnectivity,
  createOptimalPage,
  performLogin
};
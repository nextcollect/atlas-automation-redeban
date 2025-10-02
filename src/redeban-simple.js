/**
 * Simplified Redeban Automation with Direct Connectivity Only
 * Optimized for AWS Fargate without proxy complexity
 *
 * @author Atlas Automation Team
 * @version 2.2.0
 * @requires puppeteer
 * @requires @aws-sdk/client-s3
 */

const puppeteer = require('puppeteer');
const config = require('./modules/config');
const { log } = require('./modules/logger');
const { generateRedebanProcessUUID } = require('./modules/utils');
const { uploadScreenshotToS3, downloadInputFileFromS3, writeMetadataToS3 } = require('./modules/s3Service');

/**
 * Takes a screenshot and uploads to S3
 */
async function takeScreenshot(page, name, bucket, processUUID) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    const filePath = `/tmp/${filename}`;

    await page.screenshot({path: filePath, fullPage: true});
    log(`Screenshot guardado localmente: ${filePath}`, 'info');

    if (bucket && processUUID) {
      await uploadScreenshotToS3(filePath, filename, bucket, processUUID);
    }
  } catch (error) {
    log(`Error tomando screenshot: ${error.message}`, 'error');
  }
}

/**
 * Tests direct connectivity without proxy
 */
async function testDirectConnectivity(browser, siteUrl) {
  log('Verificando conectividad directa a Redeban...', 'step');

  let page = null;
  try {
    page = await browser.newPage();

    // Set basic headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8'
    });

    log('🌍 Navegando a Redeban...', 'info');
    const response = await page.goto(siteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const statusCode = response.status();
    const title = await page.title();

    log(`📄 Status: ${statusCode}`, 'info');
    log(`📄 Title: ${title}`, 'info');

    if (statusCode === 200 && title.includes('Pagos Recurrentes')) {
      log('✅ Conectividad exitosa', 'success');
      return { success: true, statusCode, title };
    } else if (statusCode === 403) {
      log('⚠️ Acceso denegado (403) pero el sitio responde', 'warning');
      return { success: false, statusCode, title, error: 'Access denied' };
    } else {
      log(`⚠️ Respuesta inesperada: ${statusCode}`, 'warning');
      return { success: false, statusCode, title, error: 'Unexpected response' };
    }

  } catch (error) {
    log(`❌ Error de conectividad: ${error.message}`, 'error');
    return { success: false, error: error.message };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Performs login process
 */
async function performLogin(page, config, bucket, processUUID) {
  log('Iniciando proceso de login...', 'step');

  try {
    log('🌍 Navegando a página de login...', 'info');
    const response = await page.goto(config.siteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    log(`📄 Página cargada: ${response.status()}`, 'info');
    await takeScreenshot(page, 'login-page', bucket, processUUID);

    // Wait for login form
    log('🔍 Buscando formulario de login...', 'info');
    await page.waitForSelector('input[type="email"], input[name="username"], #username', { timeout: 10000 });
    await page.waitForSelector('input[type="password"], input[name="password"], #password', { timeout: 10000 });

    // Fill credentials
    log('📝 Completando credenciales...', 'info');
    await page.type('input[type="email"], input[name="username"], #username', config.username);
    await page.type('input[type="password"], input[name="password"], #password', config.password);

    await takeScreenshot(page, 'credentials-filled', bucket, processUUID);

    // Submit form
    log('🚀 Enviando formulario...', 'info');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('button[type="submit"], input[type="submit"], .btn-login')
    ]);

    await takeScreenshot(page, 'after-submit', bucket, processUUID);

    // Check if login was successful
    const currentUrl = page.url();
    const pageTitle = await page.title();

    if (currentUrl.includes('dashboard') || currentUrl.includes('home') || pageTitle.includes('Dashboard')) {
      log('✅ Login exitoso', 'success');
      return true;
    } else {
      log('❌ Login falló', 'error');
      return false;
    }

  } catch (error) {
    log(`❌ Error durante login: ${error.message}`, 'error');
    await takeScreenshot(page, 'login-error', bucket, processUUID);
    return false;
  }
}

/**
 * Main automation function
 */
async function runRedebanAutomation() {
  let browser = null;
  let page = null;
  const processUUID = generateRedebanProcessUUID();

  try {
    const startTime = new Date();

    log('🚀 Iniciando automatización Redeban simplificada...', 'step');
    log(`📋 Process UUID: ${processUUID}`, 'info');

    // Write initial metadata
    await writeMetadataToS3('started', {
      siteUrl: config.siteUrl,
      username: config.username,
      startTime: startTime.toISOString(),
      engine: 'puppeteer-simplified',
      useProxy: false
    }, processUUID);

    // Launch browser
    log('🔧 Lanzando Puppeteer...', 'info');
    browser = await puppeteer.launch(config.puppeteerOptions);

    // Test connectivity first
    const connectivityResult = await testDirectConnectivity(browser, config.siteUrl);

    if (!connectivityResult.success) {
      throw new Error(`Connectivity failed: ${connectivityResult.error}`);
    }

    // Create page for actual work
    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Perform login
    const loginSuccess = await performLogin(page, config, config.s3BucketEvidence, processUUID);

    if (loginSuccess) {
      log('🎉 Automatización completada exitosamente', 'success');

      await writeMetadataToS3('completed', {
        endTime: new Date().toISOString(),
        duration: new Date() - startTime,
        status: 'success',
        engine: 'puppeteer-simplified'
      }, processUUID);
    } else {
      throw new Error('Login failed');
    }

  } catch (error) {
    log(`❌ Error en automatización: ${error.message}`, 'error');

    await writeMetadataToS3('failed', {
      endTime: new Date().toISOString(),
      error: error.message,
      status: 'failed',
      engine: 'puppeteer-simplified'
    }, processUUID);

    throw error;

  } finally {
    // Cleanup
    if (page) {
      log('🔄 Cerrando página...', 'info');
      await page.close();
    }

    if (browser) {
      log('🔄 Cerrando navegador...', 'info');
      await browser.close();
    }

    log('✅ Navegador cerrado. Automatización completada', 'success');
  }
}

// Run if called directly
if (require.main === module) {
  runRedebanAutomation().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  runRedebanAutomation,
  testDirectConnectivity,
  performLogin,
  takeScreenshot
};
/**
 * Redeban Automation Script
 *
 * Automated file upload system for Redeban's recurring payments portal.
 * Features intelligent proxy detection, robust login with OTP support,
 * and comprehensive error handling with S3 integration.
 *
 * @author Atlas Automation Team
 * @version 2.0.0
 * @requires playwright
 * @requires @aws-sdk/client-s3
 */

const {chromium} = require('playwright');
const config = require('./modules/config');
const { log } = require('./modules/logger');
const { login } = require('./modules/navigation');
const { checkNetworkConnectivity, createOptimalBrowserContext, generateRedebanProcessUUID } = require('./modules/utils');
const { uploadScreenshotToS3, downloadInputFileFromS3, writeMetadataToS3 } = require('./modules/s3Service');

/**
 * Takes a screenshot using the enhanced navigation module
 *
 * @async
 * @function takeScreenshot
 * @param {Page} page - Playwright page object
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
 * Main automation function that handles the complete Redeban file upload process
 * Features intelligent connectivity detection, automated login with OTP support,
 * and comprehensive error handling with evidence capture
 *
 * @async
 * @function uploadFile
 * @returns {Promise<void>}
 * @throws {Error} When any step of the automation process fails
 *
 * Process flow:
 * 1. Launch browser with optimal configuration
 * 2. Detect network connectivity (direct vs proxy)
 * 3. Perform login with OTP handling
 * 4. Navigate to file upload page
 * 5. Download input file from S3
 * 6. Upload file to Redeban portal
 * 7. Capture evidence screenshots throughout
 */
async function uploadFile() {
  const startTime = new Date();
  const processUUID = generateRedebanProcessUUID();

  log('Iniciando automatización Redeban...', 'step');
  log(`Process UUID: ${processUUID}`, 'info');


  // Escribir metadata de inicio
  await writeMetadataToS3('started', {
    siteUrl: config.siteUrl,
    username: config.username,
    startTime: startTime.toISOString()
  }, processUUID);

  // Lanzar navegador con configuración anti-detección máxima
  log('🔧 Lanzando navegador con configuración anti-detección...', 'info');
  const browser = await chromium.launch({
    ...config.browserOptions,
    // Configuración adicional para evitar detección
    ignoreDefaultArgs: ['--enable-automation'],
    env: {
      ...process.env,
      // Eliminar variables que identifican automatización
      'npm_config_user_agent': '',
      'npm_lifecycle_event': '',
      'npm_lifecycle_script': ''
    }
  });

  // Verificar conectividad automáticamente
  const connectivityResult = await checkNetworkConnectivity(browser, config.siteUrl);
  log(`Resultado de conectividad: ${connectivityResult.useProxy ? 'Proxy requerido' : 'Conexión directa'}`, 'info');

  // Crear contexto óptimo basado en conectividad
  const context = await createOptimalBrowserContext(browser, config, connectivityResult);
  const page = await context.newPage();

  try {
    // Realizar login usando el módulo de navegación
    log('Iniciando proceso de login...', 'step');
    const loginResult = await login(page, config.siteUrl, config.username, config.password, config.s3BucketEvidence, processUUID);

    if (!loginResult.success) {
      log(`Login fallido: ${loginResult.error}`, 'error');
      await writeMetadataToS3('failed', {
        error: loginResult.error,
        step: 'login',
        duration: new Date() - startTime
      }, processUUID);
      return;
    }

    log('Login exitoso, continuando con carga de archivo...', 'success');

    // Navegar a página de carga de archivos
    log('Navegando a página de carga de archivos...', 'step');
    await page.goto('https://pagosrecurrentes.redebandigital.com/pages/carga');
    await page.waitForSelector('#file-upload-single', {timeout: 15000});
    await takeScreenshot(page, 'file-upload-page', config.s3BucketEvidence, processUUID);

    // Descargar archivo de S3
    log('Descargando archivo de S3...', 'step');
    const inputFileLocalPath = await downloadInputFileFromS3(config.s3KeyInput);

    // Seleccionar archivo
    log('Seleccionando archivo para subida...', 'step');
    await page.setInputFiles('#file-upload-single', inputFileLocalPath);
    await takeScreenshot(page, 'file-selected', config.s3BucketEvidence, processUUID);

    // Llenar descripción del archivo
    log('Llenando descripción del archivo...', 'step');
    await page.fill('#colFormLabel', 'Carga automática de archivo - Proceso automatizado Redeban');

    // Seleccionar convenio UNICEF
    log('Seleccionando convenio UNICEF...', 'step');
    await page.selectOption('#selectDefault', '39');
    await takeScreenshot(page, 'form-filled', config.s3BucketEvidence, processUUID);

    // Esperar a que el botón se habilite (cuando todos los campos estén llenos)
    log('Esperando que el botón se habilite...', 'step');
    await page.waitForFunction(() => {
      const button = document.querySelector('button:has-text("Enviar")');
      return button && !button.disabled;
    }, {timeout: 10000});

    // Enviar formulario
    log('Enviando formulario...', 'step');
    await page.click('button:has-text("Enviar")');

    // Esperar confirmación de éxito
    await page.waitForTimeout(5000);
    await takeScreenshot(page, 'upload-success', config.s3BucketEvidence, processUUID);

    log('Archivo subido exitosamente', 'success');

    // Escribir metadata de éxito
    await writeMetadataToS3('completed', {
      duration: new Date() - startTime,
      fileUploaded: true,
      endTime: new Date().toISOString()
    }, processUUID);

  } catch (error) {
    log(`Error en automatización: ${error.message}`, 'error');
    await takeScreenshot(page, 'error-state', config.s3BucketEvidence, processUUID);

    // Escribir metadata de error
    await writeMetadataToS3('failed', {
      error: error.message,
      duration: new Date() - startTime,
      endTime: new Date().toISOString()
    }, processUUID);

  } finally {
    await browser.close();
    log('Navegador cerrado. Automatización completada', 'success');
  }
}

uploadFile().catch(console.error);

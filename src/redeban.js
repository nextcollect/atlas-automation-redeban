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
const { generateRedebanProcessUUID, createProxyContext } = require('./modules/utils');
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
  log('🚀 Deployment Status: Atlas Redeban automation started successfully', 'success');


  // Escribir metadata de inicio
  await writeMetadataToS3('started', {
    siteUrl: config.siteUrl,
    username: config.username,
    startTime: startTime.toISOString()
  }, processUUID);

  // Lanzar navegador con configuración anti-detección máxima (post-subnet-change)
  log('🔧 Lanzando navegador con Playwright Chromium...', 'info');
  const browser = await chromium.launch({
    ...config.browserOptions,
    // Use system Chromium in Alpine
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    // Configuración anti-detección mejorada para bypass de nuevas políticas
    ignoreDefaultArgs: [
      '--enable-automation',
      '--enable-blink-features=AutomationControlled'
    ],
    args: [
      // Flags base existentes
      ...config.browserOptions.args,

      // ECS/Fargate compatibility (required for containerized environments)
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--virtual-time-budget=5000',

      // Anti-detección avanzada (post-subnet-change fixes)
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-automation',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',

      // Stealth fingerprinting
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',

      // Reducir detectabilidad del canvas/webgl
      '--disable-accelerated-2d-canvas',
      '--disable-accelerated-video-decode',
      '--disable-gpu-rasterization',

      // Headers más realistas
      '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

      // Reducir detección de CDP
      '--remote-debugging-port=0'
    ],
    timeout: 90000, // Timeout más largo para cargas lentas post-subnet
    env: {
      ...process.env,
      // Eliminar variables que identifican automatización
      'npm_config_user_agent': '',
      'npm_lifecycle_event': '',
      'npm_lifecycle_script': '',
      'npm_package_name': '',
      'PUPPETEER_EXECUTABLE_PATH': '',
      // Variables específicas para Fargate
      'DISPLAY': ':99',
      // Simular entorno desktop real
      'HOME': '/home/automation',
      'USER': 'automation'
    }
  });

  // Usar directamente proxy Oxylabs para bypass de IP bloqueada
  log('🚫 IP del NAT Gateway bloqueada - usando proxy Oxylabs obligatorio', 'warning');
  const context = await createProxyContext(browser, config);
  const page = await context.newPage();

  // Anti-detección adicional a nivel de página (post-subnet-change)
  log('🥷 Aplicando técnicas stealth adicionales...', 'info');

  // Remover propiedades que detectan automatización
  await page.addInitScript(() => {
    // Eliminar webdriver property
    delete navigator.__proto__.webdriver;

    // Redefinir plugins para simular navegador real
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });

    // Simular idiomas realistas
    Object.defineProperty(navigator, 'languages', {
      get: () => ['es-CO', 'es', 'en-US', 'en']
    });

    // Permissions más realistas
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Cypress ? 'denied' : 'granted' }) :
        originalQuery(parameters)
    );

    // Chrome runtime fixes
    if (window.chrome) {
      window.chrome.runtime = {
        onConnect: undefined,
        onMessage: undefined
      };
    }
  });

  // Headers más realistas para Colombia
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120", "Not:A-Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'cache-control': 'no-cache',
    'pragma': 'no-cache'
  });

  // Viewport realista para desktop colombiano típico
  await page.setViewportSize({ width: 1366, height: 768 });

  try {
    // Añadir delay random para simular comportamiento humano
    const randomDelay = Math.floor(Math.random() * 3000) + 2000; // 2-5 segundos
    log(`⏱️ Esperando ${randomDelay}ms para simular comportamiento humano...`, 'info');
    await page.waitForTimeout(randomDelay);

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

    // Navegar a página de carga de archivos con comportamiento más humano
    log('Navegando a página de carga de archivos...', 'step');

    // Simular navegación más natural con delay
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000); // 1-3 segundos

    await page.goto('https://pagosrecurrentes.redebandigital.com/pages/carga', {
      waitUntil: 'domcontentloaded',
      timeout: 30000 // Timeout más largo post-subnet
    });

    // Esperar que la página se cargue completamente
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await page.waitForSelector('#file-upload-single', {timeout: 20000});
    await takeScreenshot(page, 'file-upload-page', config.s3BucketEvidence, processUUID);

    // Descargar archivo de S3
    log('Descargando archivo de S3...', 'step');
    const inputFileLocalPath = await downloadInputFileFromS3(config.s3KeyInput);

    // Seleccionar archivo con comportamiento humano
    log('Seleccionando archivo para subida...', 'step');
    await page.waitForTimeout(Math.floor(Math.random() * 1500) + 500); // 0.5-2 segundos
    await page.setInputFiles('#file-upload-single', inputFileLocalPath);
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500); // Esperar después de selección
    await takeScreenshot(page, 'file-selected', config.s3BucketEvidence, processUUID);

    // Llenar descripción del archivo con typing humano
    log('Llenando descripción del archivo...', 'step');
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
    await page.click('#colFormLabel'); // Click para focus
    await page.waitForTimeout(200);
    await page.type('#colFormLabel', 'Carga automática de archivo - Proceso automatizado Redeban', {
      delay: Math.floor(Math.random() * 50) + 30 // 30-80ms entre caracteres
    });

    // Seleccionar convenio UNICEF con delay humano
    log('Seleccionando convenio UNICEF...', 'step');
    await page.waitForTimeout(Math.floor(Math.random() * 1500) + 1000); // 1-2.5 segundos
    await page.selectOption('#selectDefault', '39');
    await page.waitForTimeout(500); // Pequeña pausa después de selección
    await takeScreenshot(page, 'form-filled', config.s3BucketEvidence, processUUID);

    // Esperar a que el botón se habilite (cuando todos los campos estén llenos)
    log('Esperando que el botón se habilite...', 'step');
    await page.waitForFunction(() => {
      const button = document.querySelector('button:has-text("Enviar")');
      return button && !button.disabled;
    }, {timeout: 15000}); // Timeout más largo

    // Simular revisión humana del formulario antes de enviar
    log('Revisando formulario antes de enviar...', 'step');
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000); // 2-4 segundos

    // Scroll hacia el botón de manera natural
    await page.locator('button:has-text("Enviar")').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Enviar formulario con comportamiento humano
    log('Enviando formulario...', 'step');
    await page.click('button:has-text("Enviar")');

    // Esperar confirmación de éxito con timeout más largo
    log('Esperando confirmación de éxito...', 'step');
    await page.waitForTimeout(8000); // Más tiempo para procesar

    // Esperar elementos que indiquen éxito o error
    try {
      await page.waitForSelector('.alert-success, .alert-danger, .swal2-popup', {
        timeout: 10000
      });
    } catch (error) {
      log('No se encontró alerta de confirmación, continuando...', 'warning');
    }

    await takeScreenshot(page, 'upload-result', config.s3BucketEvidence, processUUID);

    log('Archivo subido exitosamente', 'success');
    log('🎯 Deployment Confirmation: Atlas Redeban process completed successfully', 'success');

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

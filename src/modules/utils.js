const { log } = require('./logger');

// Función auxiliar para generar UUID v4 real
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generates a proper UUID v4 for Redeban process identification
 * Uses standard UUID v4 format for consistency with AWS and other systems
 *
 * @function generateRedebanProcessUUID
 * @returns {string} Standard UUID v4 format
 *
 * @example
 * const processId = generateRedebanProcessUUID();
 * // Returns: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 */
function generateRedebanProcessUUID() {
  return generateUUID();
}

// Función auxiliar para esperar un tiempo determinado
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Función auxiliar para formatear fechas
function formatDate(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

// Función auxiliar para limpiar strings
function cleanString(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
}

// Función auxiliar para validar email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Executes a function with exponential backoff retry logic
 * Useful for handling network timeouts and temporary failures
 *
 * @async
 * @function retryWithBackoff
 * @param {Function} fn - Async function to retry
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [baseDelay=1000] - Base delay in milliseconds, doubles each retry
 * @returns {Promise<any>} Result of the function if successful
 * @throws {Error} Final error if all retries fail
 *
 * @example
 * const result = await retryWithBackoff(async () => {
 *   return await unstableApiCall();
 * }, 3, 1000);
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      log(`Intento ${i + 1} falló, reintentando en ${delay}ms: ${error.message}`, 'warning');
      await sleep(delay);
    }
  }
}

// Función auxiliar para sanitizar nombres de archivo
function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9\-_.]/gi, '_');
}

// Función auxiliar para obtener timestamp para archivos
function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Función auxiliar específica para Redeban: validar OTP
function isValidOTP(otp) {
  if (!otp || typeof otp !== 'string') return false;
  // OTP típicamente es de 4-8 dígitos
  return /^\d{4,8}$/.test(otp.trim());
}

// Función auxiliar específica para Redeban: generar nombre de screenshot
function generateScreenshotName(step, timestamp = null) {
  const ts = timestamp || getTimestamp();
  const sanitizedStep = sanitizeFilename(step);
  return `redeban-${sanitizedStep}-${ts}.png`;
}

// Función auxiliar para validar URL de Redeban
function isRedebanURL(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('pagosrecurrentes.redebandigital.com');
}

// Función auxiliar para extraer información de error de Playwright
function parsePlaywrightError(error) {
  if (!error || !error.message) return { type: 'unknown', message: 'Error desconocido' };

  const message = error.message.toLowerCase();

  if (message.includes('timeout')) {
    return { type: 'timeout', message: 'Timeout esperando elemento o navegación' };
  } else if (message.includes('net::err_timed_out')) {
    return { type: 'network', message: 'Error de conexión - timeout de red' };
  } else if (message.includes('403') || message.includes('forbidden')) {
    return { type: 'access', message: 'Acceso prohibido - verificar proxy/IP' };
  } else if (message.includes('selector')) {
    return { type: 'selector', message: 'Elemento no encontrado en la página' };
  } else {
    return { type: 'general', message: error.message };
  }
}

// Función auxiliar para wait con mensaje personalizado
async function waitWithMessage(ms, message = null) {
  if (message) {
    log(message, 'info');
  }
  await sleep(ms);
}

/**
 * Verifies network connectivity to Redeban site, testing direct connection first
 * then determining if proxy is required based on response status and page content
 *
 * @async
 * @function checkNetworkConnectivity
 * @param {Browser} browser - Playwright browser instance
 * @param {string} siteUrl - Target Redeban URL to test connectivity
 * @returns {Promise<Object>} Object containing useProxy boolean, statusCode, title, and optional error
 * @throws {Error} When both direct and proxy connectivity checks fail
 *
 * @example
 * const result = await checkNetworkConnectivity(browser, 'https://pagosrecurrentes.redebandigital.com');
 * // Returns: { useProxy: false, statusCode: 200, title: 'Pagos Recurrentes...' }
 */
async function checkNetworkConnectivity(browser, siteUrl) {
  log('Verificando conectividad de red a Redeban...', 'step');

  // Primero intentar sin proxy (para diagnóstico)
  try {
    log('Probando conexión directa (sin proxy)...', 'info');
    const contextDirect = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'es-CO',
      timezoneId: 'America/Bogota'
    });

    const pageDirect = await contextDirect.newPage();

    // Intentar cargar la página con timeout corto
    const response = await pageDirect.goto(siteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    const statusCode = response.status();
    const title = await pageDirect.title();

    await contextDirect.close();

    // Si la página carga correctamente (status 200 y título contiene "Pagos Recurrentes")
    if (statusCode === 200 && title.includes('Pagos Recurrentes')) {
      log('✅ Conexión directa exitosa - no se requiere proxy', 'success');
      return { useProxy: false, statusCode, title };
    } else if (statusCode === 403) {
      log(`⚠️ Conexión directa bloqueada (403) - se requiere proxy Colombia`, 'warning');
      return { useProxy: true, statusCode, title };
    } else {
      log(`⚠️ Conexión directa con problemas (${statusCode}) - se requiere proxy Colombia`, 'warning');
      return { useProxy: true, statusCode, title };
    }

  } catch (error) {
    log(`❌ Conexión directa falló: ${error.message}`, 'error');

    // TEMPORAL: Las pruebas muestran que Node.js directo funciona desde Fargate
    // pero el proxy Oxylabs no es accesible desde las subnets privadas
    const errorInfo = parsePlaywrightError(error);
    log('🔧 TEMPORAL: Node.js directo funciona pero Playwright falla - intentando configuración especial', 'warning');
    log('🔧 NOTA: Proxy Oxylabs no accesible desde subnets privadas AWS', 'warning');
    return { useProxy: false, error: errorInfo.message, forceDirectConnection: true };
  }
}

/**
 * Creates an optimal browser context based on connectivity test results,
 * automatically configuring proxy settings when required
 *
 * @async
 * @function createOptimalBrowserContext
 * @param {Browser} browser - Playwright browser instance
 * @param {Object} config - Configuration object containing proxy settings
 * @param {Object} [connectivityResult=null] - Result from checkNetworkConnectivity, runs check if null
 * @returns {Promise<BrowserContext>} Configured browser context ready for use
 * @throws {Error} When browser context creation fails
 *
 * @example
 * const context = await createOptimalBrowserContext(browser, config);
 * // Returns browser context with optimal proxy configuration
 */
async function createOptimalBrowserContext(browser, config, connectivityResult = null) {
  log('Creando contexto de navegador óptimo...', 'step');

  // Si no se proporciona resultado de conectividad, verificarla
  if (!connectivityResult) {
    connectivityResult = await checkNetworkConnectivity(browser, config.siteUrl);
  }

  const baseConfig = {
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-CO',
    timezoneId: 'America/Bogota'
  };

  if (connectivityResult.useProxy) {
    log('🇨🇴 Configurando contexto con proxy Oxylabs Colombia...', 'info');
    log(`Proxy: ${config.proxyHost}:${config.proxyPort}`, 'info');
    log(`Usuario: ${config.proxyUsername.substring(0, 30)}...`, 'info');

    const proxyConfig = {
      ...baseConfig,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      proxy: {
        server: `http://${config.proxyHost}:${config.proxyPort}`,
        username: config.proxyUsername,
        password: config.proxyPassword
      }
    };

    return await browser.newContext(proxyConfig);
  } else {
    log('🔧 Configurando contexto directo con configuración especial (Proxy no disponible en AWS)...', 'info');

    // Configuración anti-detección máxima para imitar Node.js exitoso
    const specialConfig = {
      ...baseConfig,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      acceptDownloads: false,
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      }
    };

    log('🔧 Usando user-agent Chrome Windows con headers completos', 'info');
    return await browser.newContext(specialConfig);
  }
}

module.exports = {
  generateUUID,
  generateRedebanProcessUUID,
  sleep,
  formatDate,
  cleanString,
  isValidEmail,
  retryWithBackoff,
  sanitizeFilename,
  getTimestamp,
  isValidOTP,
  generateScreenshotName,
  isRedebanURL,
  parsePlaywrightError,
  waitWithMessage,
  checkNetworkConnectivity,
  createOptimalBrowserContext
};
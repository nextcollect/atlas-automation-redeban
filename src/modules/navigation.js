/**
 * Navigation Module for Redeban Automation
 *
 * Handles all browser navigation, form interactions, and login processes
 * for the Redeban portal. Includes comprehensive OTP handling, error detection,
 * and screenshot capture for evidence collection.
 *
 * @author Atlas Automation Team
 * @version 1.0.0
 * @module navigation
 */

const { log } = require('./logger');
const config = require('./config');
const { uploadScreenshotToS3 } = require('./s3Service');

/**
 * Takes a screenshot of the current page and optionally uploads to S3
 *
 * @async
 * @function takeScreenshot
 * @param {Page} page - Playwright page object
 * @param {string} name - Base name for the screenshot file
 * @param {string} [bucket] - S3 bucket for upload (optional)
 * @param {string} [processUUID] - Process UUID for S3 organization (optional)
 * @returns {Promise<void>}
 */
async function takeScreenshot(page, name, bucket, processUUID) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    const filePath = `/tmp/${filename}`;

    await page.screenshot({path: filePath, fullPage: true});
    log(`Screenshot guardado localmente: ${filePath}`, 'info');

    if (bucket && processUUID) {
      // Subir screenshot a S3
      await uploadScreenshotToS3(filePath, filename, bucket, processUUID);
      log(`Screenshot subido a S3: s3://${bucket}/${processUUID}/screenshots/${filename}`, 'success');
    } else {
      log('No se proporcionaron parámetros S3, screenshot solo guardado localmente', 'warning');
    }
  } catch (error) {
    log(`Error tomando screenshot: ${error.message}`, 'error');
  }
}

/**
 * Waits for OTP input from WebSocket connection (for Fargate containers)
 *
 * @async
 * @function waitForOTPFromWebSocket
 * @param {number} [timeoutMs=120000] - Timeout in milliseconds (default 2 minutes)
 * @returns {Promise<string>} The OTP code received via WebSocket
 * @throws {Error} When timeout is reached or no OTP received
 */
async function waitForOTPFromWebSocket(timeoutMs = 120000) {
  return new Promise(async (resolve, reject) => {
    log('📱 Por favor, revisa tu teléfono/email para el código OTP', 'step');
    log(`⏰ Esperando código OTP desde command center (timeout: ${timeoutMs / 1000}s)`, 'info');
    log('🔢 Ingresa el código OTP que recibiste: ', 'info');

    // Verificar permisos del directorio /tmp al inicio
    try {
      const fs = require('fs').promises;
      const tmpStats = await fs.stat('/tmp');
      log(`📊 Permisos directorio /tmp: ${tmpStats.mode.toString(8)}`, 'info');
    } catch (error) {
      log(`⚠️ No se puede acceder a /tmp: ${error.message}`, 'warning');
    }

    const fs = require('fs').promises;
    const otpFilePath = '/tmp/otp-input.txt';
    const checkInterval = 1000; // Check every second
    let elapsedTime = 0;

    const checkForOTPFile = async () => {
      try {
        log(`🔍 Verificando archivo OTP en: ${otpFilePath} (${elapsedTime / 1000}s)`, 'info');

        // Verificar si el archivo existe primero
        const fileExists = await fs.access(otpFilePath).then(() => true).catch(() => false);

        if (!fileExists) {
          if (elapsedTime % 10000 === 0) { // Log cada 10 segundos
            log(`📂 Archivo OTP no encontrado, esperando... (${elapsedTime / 1000}s)`, 'info');
          }

          elapsedTime += checkInterval;
          if (elapsedTime >= timeoutMs) {
            reject(new Error(`Timeout: No se recibió OTP en ${timeoutMs / 1000} segundos`));
            return;
          }

          setTimeout(checkForOTPFile, checkInterval);
          return;
        }

        // El archivo existe, intentar leerlo
        const otp = await fs.readFile(otpFilePath, 'utf8');
        log(`📄 Contenido del archivo OTP: "${otp}" (length: ${otp.length})`, 'info');

        const cleanOtp = otp.trim();

        if (cleanOtp && /^\d{6}$/.test(cleanOtp)) {
          // Limpiar el archivo
          try {
            await fs.unlink(otpFilePath);
            log(`🗑️ Archivo OTP eliminado: ${otpFilePath}`, 'info');
          } catch (unlinkError) {
            log(`⚠️ Warning: No se pudo eliminar archivo OTP: ${unlinkError.message}`, 'warning');
          }

          log(`✅ OTP recibido desde command center: ${cleanOtp.substring(0, 2)}****`, 'success');
          resolve(cleanOtp);
          return;
        } else {
          log(`❌ OTP inválido o vacío: "${cleanOtp}" (regex test: ${/^\d{6}$/.test(cleanOtp)})`, 'warning');

          // Si el OTP es inválido, eliminar el archivo y continuar esperando
          try {
            await fs.unlink(otpFilePath);
            log(`🗑️ Archivo OTP inválido eliminado`, 'info');
          } catch (unlinkError) {
            log(`⚠️ Warning: No se pudo eliminar archivo OTP inválido: ${unlinkError.message}`, 'warning');
          }
        }
      } catch (error) {
        // Error leyendo el archivo (puede estar siendo escrito)
        log(`⚠️ Error leyendo archivo OTP (puede estar siendo escrito): ${error.message}`, 'warning');
      }

      elapsedTime += checkInterval;
      if (elapsedTime >= timeoutMs) {
        reject(new Error(`Timeout: No se recibió OTP válido en ${timeoutMs / 1000} segundos`));
        return;
      }

      // Continue checking
      setTimeout(checkForOTPFile, checkInterval);
    };

    // Start checking
    setTimeout(checkForOTPFile, checkInterval);
  });
}

/**
 * Prompts user for OTP input via console interface with timeout
 *
 * @async
 * @function waitForOTPFromConsole
 * @param {number} [timeoutMs=30000] - Timeout in milliseconds (default 30 seconds)
 * @returns {Promise<string>} The OTP code entered by user (trimmed)
 * @throws {Error} When timeout is reached
 */
async function waitForOTPFromConsole(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    log('📱 Por favor, revisa tu teléfono/email para el código OTP', 'step');
    log(`⏰ Tienes ${timeoutMs / 1000} segundos para ingresar el código`, 'warning');

    const timeout = setTimeout(() => {
      rl.close();
      reject(new Error(`Timeout: No se ingresó OTP en ${timeoutMs / 1000} segundos`));
    }, timeoutMs);

    rl.question('🔢 Ingresa el código OTP que recibiste: ', otp => {
      clearTimeout(timeout);
      rl.close();
      resolve(otp.trim());
    });
  });
}

/**
 * Shows an HTML modal for OTP input using Playwright dialog
 *
 * @async
 * @function showOTPModal
 * @param {Page} page - Playwright page object
 * @returns {Promise<string>} The OTP code entered by user
 */
async function showOTPModal(page) {
  try {
    log('Mostrando modal HTML para ingreso de OTP...', 'step');

    // Inyectar modal HTML en la página
    const otpValue = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Crear overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Crear modal
        const modal = document.createElement('div');
        modal.style.cssText = `
          background: white;
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          max-width: 420px;
          width: 90%;
          animation: slideIn 0.3s ease-out;
        `;

        // Agregar animación
        const style = document.createElement('style');
        style.textContent = `
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `;
        document.head.appendChild(style);

        // Contenido del modal
        modal.innerHTML = `
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
            <h2 style="margin: 0 0 8px 0; color: #333; font-size: 24px; font-weight: 600;">Verificación OTP</h2>
            <p style="margin: 0; color: #666; font-size: 14px;">Por favor, ingresa el código de verificación que recibiste</p>
          </div>

          <div style="margin-bottom: 24px;">
            <label style="display: block; margin-bottom: 8px; color: #555; font-size: 14px; font-weight: 500;">Código OTP:</label>
            <input type="text"
              id="otp-input"
              placeholder="Ingresa el código aquí"
              maxlength="10"
              style="
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e1e4e8;
                border-radius: 8px;
                font-size: 16px;
                box-sizing: border-box;
                transition: border-color 0.2s;
                text-align: center;
                letter-spacing: 2px;
                font-weight: 600;
              "
              onfocus="this.style.borderColor='#0969da'"
              onblur="this.style.borderColor='#e1e4e8'"
            />
          </div>

          <div style="display: flex; gap: 12px;">
            <button
              id="cancel-btn"
              style="
                flex: 1;
                padding: 12px 20px;
                background: #f6f8fa;
                color: #24292e;
                border: 1px solid #d1d5da;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s;
              "
              onmouseover="this.style.backgroundColor='#f3f4f6'"
              onmouseout="this.style.backgroundColor='#f6f8fa'"
            >Cancelar</button>

            <button
              id="submit-btn"
              style="
                flex: 2;
                padding: 12px 20px;
                background: #0969da;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s;
              "
              onmouseover="this.style.backgroundColor='#0860ca'"
              onmouseout="this.style.backgroundColor='#0969da'"
            >Verificar Código</button>
          </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Focus en el input
        const input = document.getElementById('otp-input');
        input.focus();

        // Manejar eventos
        const submitBtn = document.getElementById('submit-btn');
        const cancelBtn = document.getElementById('cancel-btn');

        const submit = () => {
          const value = input.value.trim();
          if (value) {
            document.body.removeChild(overlay);
            if (style.parentNode) {
              style.parentNode.removeChild(style);
            }
            resolve(value);
          } else {
            input.style.borderColor = '#dc3545';
            input.placeholder = 'Por favor ingresa un código';
            setTimeout(() => {
              input.style.borderColor = '#e1e4e8';
              input.placeholder = 'Ingresa el código aquí';
            }, 2000);
          }
        };

        submitBtn.onclick = submit;
        cancelBtn.onclick = () => {
          document.body.removeChild(overlay);
          if (style.parentNode) {
            style.parentNode.removeChild(style);
          }
          resolve('');
        };

        // Permitir envío con Enter
        input.onkeypress = (e) => {
          if (e.key === 'Enter') {
            submit();
          }
        };
      });
    });

    if (!otpValue) {
      throw new Error('OTP no proporcionado o cancelado por el usuario');
    }

    log(`OTP recibido del modal: ${otpValue.substring(0, 2)}****`, 'success');
    return otpValue;

  } catch (error) {
    log(`Error mostrando modal OTP: ${error.message}`, 'error');
    log('Fallback a entrada por consola...', 'warning');
    // Fallback a consola si el modal falla
    return await waitForOTPFromConsole();
  }
}

async function fillLoginForm(page, username, password) {
  log('Llenando formulario de login...', 'step');

  // Selectores múltiples para username
  const usernameSelectors = [
    'input[name="f_username"]',
    'input[placeholder="nombre de usuario"]',
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="email"]',
    'input[placeholder*="correo"]',
    'input[placeholder*="usuario"]',
    'input[placeholder*="user"]'
  ];

  // Selectores múltiples para password
  const passwordSelectors = [
    'input[name="f_password"]',
    'input[type="password"]',
    'input[name="password"]',
    'input[placeholder*="password"]',
    'input[placeholder*="contraseña"]',
    'input[placeholder*="clave"]'
  ];

  let usernameFilled = false;
  let passwordFilled = false;

  // Llenar username
  for (const selector of usernameSelectors) {
    try {
      await page.fill(selector, username);
      log(`Username llenado con selector: ${selector}`, 'success');
      usernameFilled = true;
      break;
    } catch (error) {
      // Continuar con el siguiente selector
    }
  }

  // Llenar password
  for (const selector of passwordSelectors) {
    try {
      await page.fill(selector, password);
      log(`Password llenado con selector: ${selector}`, 'success');
      passwordFilled = true;
      break;
    } catch (error) {
      // Continuar con el siguiente selector
    }
  }

  if (!usernameFilled || !passwordFilled) {
    throw new Error('No se pudieron llenar los campos del formulario');
  }

  return { usernameFilled, passwordFilled };
}

async function submitLoginForm(page) {
  log('Enviando formulario de login...', 'step');

  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Ingresar")',
    'button:has-text("Iniciar")',
    'button:has-text("Login")',
    'button:has-text("Entrar")',
    'button:has-text("Submit")',
    'form button',
    'form input[type="submit"]'
  ];

  let formSubmitted = false;
  for (const selector of submitSelectors) {
    try {
      await page.click(selector);
      log(`Formulario enviado con selector: ${selector}`, 'success');
      formSubmitted = true;
      break;
    } catch (error) {
      // Continuar con el siguiente selector
    }
  }

  if (!formSubmitted) {
    // Intentar con Enter key como último recurso
    try {
      await page.keyboard.press('Enter');
      log('Formulario enviado con tecla Enter', 'success');
      formSubmitted = true;
    } catch (error) {
      throw new Error('No se pudo enviar el formulario');
    }
  }

  return formSubmitted;
}

async function handleOTPFlow(page, bucket, processUUID) {
  log('Verificando si se requiere OTP...', 'step');

  // Esperar un poco para que la página procese
  await page.waitForTimeout(3000);

  const otpSelectors = [
    'input[name="f_codigo"]',
    'input[placeholder="codigo de verificacion"]',
    'input[placeholder*="OTP"]',
    'input[placeholder*="código"]',
    'input[placeholder*="verificación"]',
    'input[placeholder*="token"]',
    'input[name*="otp"]',
    'input[name*="code"]',
    'input[name*="token"]',
    'input[type="text"]'
  ];

  let otpFieldFound = false;
  let otpSelector = null;

  for (const selector of otpSelectors) {
    try {
      const otpField = await page.$(selector);
      if (otpField) {
        log(`Campo OTP encontrado: ${selector}`, 'success');
        otpFieldFound = true;
        otpSelector = selector;
        break;
      }
    } catch (error) {
      // Continuar con el siguiente selector
    }
  }

  if (!otpFieldFound) {
    log('No se encontró campo OTP, verificando si el login fue exitoso...', 'warning');
    return await checkLoginSuccess(page);
  }

  await takeScreenshot(page, 'otp-page', bucket, processUUID);

  // Solicitar OTP al usuario con timeout extendido para Fargate
  let otp;
  try {
    // Detectar si estamos en Fargate (sin stdin disponible)
    const isProduction = process.env.NODE_ENV === 'production';
    const timeoutMs = isProduction ? 120000 : 30000; // 2 minutos en prod, 30s en dev

    log(`⏰ Timeout configurado: ${timeoutMs / 1000} segundos (${isProduction ? 'production' : 'development'})`, 'info');

    if (isProduction && !process.stdin.isTTY) {
      log('🔄 Entorno de producción detectado - esperando OTP desde command center', 'info');
      otp = await waitForOTPFromWebSocket(timeoutMs);
    } else {
      otp = await waitForOTPFromConsole(timeoutMs);
    }
  } catch (error) {
    log(`Error obteniendo OTP: ${error.message}`, 'error');
    throw new Error('OTP no proporcionado o timeout alcanzado');
  }

  if (!otp) {
    throw new Error('OTP no proporcionado');
  }

  // Llenar campo OTP
  await page.fill(otpSelector, otp);
  log('Campo OTP llenado', 'success');
  await takeScreenshot(page, 'otp-filled', bucket, processUUID);

  // Enviar OTP
  await page.keyboard.press('Enter');
  log('OTP enviado', 'step');

  // Esperar respuesta
  await page.waitForTimeout(5000);
  await takeScreenshot(page, 'otp-response', bucket, processUUID);

  // Verificar si el OTP fue válido
  return await checkOTPResult(page, bucket, processUUID);
}

async function checkOTPResult(page, bucket, processUUID) {
  const currentHTML = await page.content();

  // Verificar errores de OTP inválido
  const invalidOTPSelectors = [
    'div.invalid-feedback.d-block',
    'div.ng-star-inserted:contains("Código inválido")',
    'div:contains("Código inválido o expirado")',
    '.invalid-feedback',
    '[class*="invalid"]'
  ];

  let invalidOTPFound = false;
  for (const selector of invalidOTPSelectors) {
    try {
      const errorElement = await page.$(selector);
      if (errorElement) {
        const errorText = await errorElement.textContent();
        if (errorText && errorText.includes('Código inválido')) {
          log(`Error OTP detectado: ${errorText.trim()}`, 'error');
          invalidOTPFound = true;
          break;
        }
      }
    } catch (error) {}
  }

  // También verificar en el HTML completo
  if (!invalidOTPFound && currentHTML.includes('Código inválido o expirado')) {
    log('OTP inválido detectado en contenido HTML', 'error');
    invalidOTPFound = true;
  }

  if (!invalidOTPFound && currentHTML.includes('invalid-feedback d-block ng-star-inserted')) {
    log('OTP inválido detectado - estructura HTML específica', 'error');
    invalidOTPFound = true;
  }

  if (invalidOTPFound) {
    await takeScreenshot(page, 'otp-invalid', bucket, processUUID);
    return { success: false, error: 'OTP inválido o expirado' };
  }

  // Si no hay errores, verificar éxito del login
  return await checkLoginSuccess(page);
}

async function checkLoginSuccess(page) {
  const currentTitle = await page.title();
  const currentURL = page.url();

  log(`Título actual: ${currentTitle}`, 'info');
  log(`URL actual: ${currentURL}`, 'info');

  // Verificar indicadores de login exitoso
  const successIndicators = [
    currentTitle.includes('Dashboard'),
    currentTitle.includes('Home'),
    currentTitle.includes('Welcome'),
    currentTitle.includes('Inicio'),
    currentURL.includes('dashboard'),
    currentURL.includes('home'),
    currentURL.includes('main')
  ];

  const loginSuccessful = successIndicators.some(indicator => indicator);

  if (loginSuccessful) {
    log('Login exitoso detectado', 'success');
    return { success: true, message: 'Login completado exitosamente' };
  } else {
    log('Estado de login incierto', 'warning');
    return { success: false, error: 'Estado de login incierto' };
  }
}

async function checkCredentialErrors(page) {
  log('Verificando errores de credenciales...', 'step');

  const currentURL = page.url();
  const currentHTML = await page.content();

  // Selectores específicos para errores de credenciales (más restrictivos)
  const credentialErrorSelectors = [
    '.alert-danger',
    '.error-message',
    'div.invalid-feedback.d-block:contains("incorrectos")',
    'div.invalid-feedback.d-block:contains("inválidas")',
    'div[class*="error"]:contains("usuario")',
    'div[class*="error"]:contains("contraseña")'
  ];

  // Verificar selectores específicos
  for (const selector of credentialErrorSelectors) {
    try {
      const errorElement = await page.$(selector);
      if (errorElement) {
        const errorText = await errorElement.textContent();
        if (errorText && errorText.toLowerCase().includes('Credenciales incorrectas')) {
          return errorText.trim();
        }
      }
    } catch (error) {
      // Continuar con el siguiente selector
    }
  }

  // Verificar en el contenido HTML completo - solo el texto exacto
  if (currentHTML.toLowerCase().includes('Credenciales incorrectas')) {
    return 'Credenciales incorrectas';
  }

  // Solo verificar errores explícitos, NO asumir error por estar en página de login
  // (puede ser una página intermedia o de OTP)
  log('No se detectaron mensajes de error explícitos de credenciales', 'info');

  return null; // No se detectaron errores de credenciales
}

/**
 * Performs complete login process for Redeban portal including OTP handling
 *
 * @async
 * @function login
 * @param {Page} page - Playwright page object
 * @param {string} siteUrl - Redeban login URL
 * @param {string} username - Login username
 * @param {string} password - Login password
 * @param {string} [bucket] - S3 bucket for evidence storage
 * @param {string} [processUUID] - Process UUID for organization
 * @returns {Promise<Object>} Login result object with success boolean and optional error
 *
 * @example
 * const result = await login(page, config.siteUrl, 'user', 'pass', bucket, uuid);
 * if (result.success) {
 *   console.log('Login successful');
 * }
 */
async function login(page, siteUrl, username, password, bucket, processUUID) {
  try {
    log('Iniciando proceso de login...', 'step');
    log(`Navegando a: ${siteUrl}`);

    // Navegar a la página de login con configuración especial
    log('🔧 Navegando con configuración especial de compatibilidad...', 'info');

    // Configuraciones anti-detección avanzadas
    await page.addInitScript(() => {
      // Eliminar todas las propiedades de automatización
      delete window.navigator.webdriver;
      delete window.navigator.__webdriver_script_fn;
      delete window.navigator.__webdriver_evaluate;
      delete window.navigator.__selenium_unwrapped;
      delete window.navigator.__webdriver_unwrapped;
      delete window.navigator.__driver_evaluate;
      delete window.navigator.__webdriver_script_func;
      delete window.navigator.__webdriver_script_function;

      // Sobrescribir propiedades del navegador
      Object.defineProperty(window.navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chromium PDF Plugin', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Microsoft Edge PDF Plugin', filename: 'pdf' },
          { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer' }
        ]
      });
      Object.defineProperty(window.navigator, 'languages', { get: () => ['es-ES', 'es', 'en-US', 'en'] });
      Object.defineProperty(window.navigator, 'webdriver', { get: () => undefined });

      // Simular propiedades reales del navegador
      Object.defineProperty(window.navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(window.navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(window.navigator, 'platform', { get: () => 'Win32' });

      // Simular WebGL
      const getParameter = WebGLRenderingContext.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel(R) Iris(R) Xe Graphics';
        return getParameter(parameter);
      };
    });

    await page.goto(siteUrl, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.waitForLoadState('networkidle');
    await takeScreenshot(page, 'login-page', bucket, processUUID);

    const currentUrl = page.url();
    log(`URL actual: ${currentUrl}`);

    // Verificar título de página
    const pageTitle = await page.title();
    log(`Título de página: ${pageTitle}`);

    if (!pageTitle.includes('Pagos Recurrentes')) {
      throw new Error('Página de login no encontrada');
    }

    // Esperar elementos del formulario
    log('Esperando elementos del formulario...', 'step');
    try {
      await page.waitForSelector('input[name="f_username"], input[placeholder="nombre de usuario"]', { timeout: 10000 });
      await page.waitForSelector('input[name="f_password"], input[type="password"]', { timeout: 10000 });
      log('Elementos del formulario encontrados', 'success');
    } catch (error) {
      log('Elementos estándar no encontrados, intentando selectores alternativos...', 'warning');
    }

    // Llenar formulario
    await fillLoginForm(page, username, password);
    await takeScreenshot(page, 'form-filled', bucket, processUUID);

    // Enviar formulario
    await submitLoginForm(page);
    await page.waitForLoadState('networkidle');
    await takeScreenshot(page, 'post-login', bucket, processUUID);

    // Verificar errores de credenciales antes de proceder con OTP
    const credentialError = await checkCredentialErrors(page);
    if (credentialError) {
      log(`Credenciales incorrectas detectadas: ${credentialError}`, 'error');
      await takeScreenshot(page, 'credential-error', bucket, processUUID);

      // Cerrar sesión del navegador cuando hay error de credenciales
      try {
        log('Cerrando sesión del navegador debido a credenciales incorrectas...', 'step');
        await page.close();
        log('Sesión del navegador cerrada', 'success');
      } catch (closeError) {
        log(`Error cerrando sesión: ${closeError.message}`, 'warning');
      }

      return { success: false, error: `Credenciales incorrectas: ${credentialError}` };
    }

    // Manejar flujo OTP con entrada por consola
    const result = await handleOTPFlow(page, bucket, processUUID);

    if (result.success) {
      log('Login completado exitosamente', 'success');
      return result;
    } else {
      log(`Error en login: ${result.error}`, 'error');
      return result;
    }

  } catch (error) {
    log(`Error durante login: ${error.message}`, 'error');
    await takeScreenshot(page, 'login-error', bucket, processUUID);

    // Cerrar sesión del navegador en caso de error general
    try {
      if (page && !page.isClosed()) {
        log('Cerrando sesión del navegador debido a error en login...', 'step');
        await page.close();
        log('Sesión del navegador cerrada', 'success');
      }
    } catch (closeError) {
      log(`Error cerrando sesión: ${closeError.message}`, 'warning');
    }

    return { success: false, error: error.message };
  }
}

module.exports = {
  login,
  takeScreenshot,
  waitForOTPFromConsole,
  waitForOTPFromWebSocket,
  checkLoginSuccess,
  handleOTPFlow
};
#!/usr/bin/env node

/**
 * Script de prueba de conectividad para diagnosticar problemas de red
 * con Redeban desde el contenedor Fargate existente
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('./src/modules/config');

const REDEBAN_URL = config.siteUrl;

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// Test 1: Conectividad directa
async function testDirectConnection() {
  log('=== PRUEBA 1: Conectividad Directa ===');

  return new Promise((resolve) => {
    const url = new URL(REDEBAN_URL);
    const startTime = Date.now();

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'GET',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      log(`✅ Conexión directa exitosa`, 'success');
      log(`   Status: ${res.statusCode}`);
      log(`   Tiempo de respuesta: ${responseTime}ms`);

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const hasRedebanContent = data.includes('Pagos Recurrentes') || data.includes('redeban');
        log(`   Contenido Redeban detectado: ${hasRedebanContent ? 'SÍ' : 'NO'}`);
        resolve({ success: true, statusCode: res.statusCode, responseTime, hasRedebanContent });
      });
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      log(`❌ Error en conexión directa: ${error.message}`, 'error');
      log(`   Código de error: ${error.code}`);
      log(`   Tiempo transcurrido: ${responseTime}ms`);
      resolve({ success: false, error: error.message, code: error.code, responseTime });
    });

    req.on('timeout', () => {
      const responseTime = Date.now() - startTime;
      log(`❌ Timeout en conexión directa (${responseTime}ms)`, 'error');
      req.destroy();
      resolve({ success: false, error: 'TIMEOUT', responseTime });
    });

    req.end();
  });
}

// Test 2: Conectividad vía proxy Node.js
async function testProxyConnection() {
  log('\n=== PRUEBA 2: Conectividad vía Proxy Oxylabs (Node.js) ===');

  return new Promise((resolve) => {
    const url = new URL(REDEBAN_URL);
    const startTime = Date.now();
    const auth = Buffer.from(`${config.proxyUsername}:${config.proxyPassword}`).toString('base64');

    log(`Proxy: ${config.proxyHost}:${config.proxyPort}`);
    log(`Usuario: ${config.proxyUsername.substring(0, 20)}...`);

    const proxyOptions = {
      hostname: config.proxyHost,
      port: config.proxyPort,
      method: 'CONNECT',
      path: `${url.hostname}:443`,
      headers: {
        'Proxy-Authorization': `Basic ${auth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 20000
    };

    const proxyReq = http.request(proxyOptions);

    proxyReq.on('connect', (res, socket, head) => {
      log(`✅ Conexión CONNECT al proxy exitosa (Status: ${res.statusCode})`, 'success');

      const httpsOptions = {
        socket: socket,
        servername: url.hostname,
        path: url.pathname,
        method: 'GET',
        headers: {
          'Host': url.hostname,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const httpsReq = https.request(httpsOptions, (httpsRes) => {
        const responseTime = Date.now() - startTime;
        log(`✅ Respuesta de Redeban vía proxy recibida`, 'success');
        log(`   Status: ${httpsRes.statusCode}`);
        log(`   Tiempo de respuesta: ${responseTime}ms`);

        let data = '';
        httpsRes.on('data', chunk => data += chunk);
        httpsRes.on('end', () => {
          const hasRedebanContent = data.includes('Pagos Recurrentes') || data.includes('redeban');
          log(`   Contenido Redeban detectado: ${hasRedebanContent ? 'SÍ' : 'NO'}`);
          resolve({ success: true, statusCode: httpsRes.statusCode, responseTime, hasRedebanContent });
        });
      });

      httpsReq.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        log(`❌ Error en petición HTTPS vía proxy: ${error.message}`, 'error');
        resolve({ success: false, error: error.message, responseTime });
      });

      httpsReq.end();
    });

    proxyReq.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      log(`❌ Error conectando al proxy: ${error.message}`, 'error');
      log(`   Código de error: ${error.code}`);
      log(`   Tiempo transcurrido: ${responseTime}ms`);
      resolve({ success: false, error: error.message, code: error.code, responseTime });
    });

    proxyReq.on('timeout', () => {
      const responseTime = Date.now() - startTime;
      log(`❌ Timeout conectando al proxy (${responseTime}ms)`, 'error');
      proxyReq.destroy();
      resolve({ success: false, error: 'TIMEOUT', responseTime });
    });

    proxyReq.end();
  });
}

// Test 2B: Conectividad vía proxy con Playwright
async function testPlaywrightProxyConnection() {
  log('\n=== PRUEBA 2B: Conectividad vía Proxy Oxylabs (Playwright) ===');

  const { chromium } = require('playwright');

  try {
    const browser = await chromium.launch({ headless: true });
    const startTime = Date.now();

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'es-CO',
      timezoneId: 'America/Bogota',
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
    });

    const page = await context.newPage();

    const response = await page.goto(REDEBAN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const responseTime = Date.now() - startTime;
    const statusCode = response.status();
    const title = await page.title();
    const hasRedebanContent = title.includes('Pagos Recurrentes') || title.includes('redeban');

    log(`✅ Playwright con proxy exitoso`, 'success');
    log(`   Status: ${statusCode}`);
    log(`   Título: ${title}`);
    log(`   Tiempo de respuesta: ${responseTime}ms`);
    log(`   Contenido Redeban detectado: ${hasRedebanContent ? 'SÍ' : 'NO'}`);

    await browser.close();
    return { success: true, statusCode, responseTime, hasRedebanContent, title };

  } catch (error) {
    log(`❌ Error en Playwright con proxy: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

// Test 3: Resolución DNS
async function testDNSResolution() {
  log('\n=== PRUEBA 3: Resolución DNS ===');

  return new Promise((resolve) => {
    const dns = require('dns');
    const hostname = 'pagosrecurrentes.redebandigital.com';

    dns.lookup(hostname, (err, address, family) => {
      if (err) {
        log(`❌ Error en resolución DNS: ${err.message}`, 'error');
        resolve({ success: false, error: err.message });
      } else {
        log(`✅ DNS resuelto correctamente`, 'success');
        log(`   ${hostname} → ${address} (IPv${family})`);
        resolve({ success: true, address, family });
      }
    });
  });
}

// Test 4: Verificar variables de entorno
function testEnvironmentVariables() {
  log('\n=== PRUEBA 4: Variables de Entorno ===');

  const envVars = {
    'SITE_URL': config.siteUrl,
    'PROXY_HOST': config.proxyHost,
    'PROXY_PORT': config.proxyPort,
    'PROXY_USERNAME': config.proxyUsername ? config.proxyUsername.substring(0, 20) + '...' : 'NOT SET',
    'PROXY_PASSWORD': config.proxyPassword ? '***SET***' : 'NOT SET'
  };

  Object.entries(envVars).forEach(([key, value]) => {
    log(`   ${key}: ${value}`);
  });

  return envVars;
}

// Función principal
async function runConnectivityTests() {
  log('🔍 Iniciando pruebas de conectividad para Redeban desde Fargate');
  log(`Target: ${REDEBAN_URL}`);
  log('================================================\n');

  try {
    // Test variables de entorno
    const envVars = testEnvironmentVariables();

    // Test DNS
    const dnsResult = await testDNSResolution();

    // Test conexión directa
    const directResult = await testDirectConnection();

    // Test conexión vía proxy Node.js
    const proxyResult = await testProxyConnection();

    // Test conexión vía proxy Playwright
    const playwrightProxyResult = await testPlaywrightProxyConnection();

    // Resumen
    log('\n=== RESUMEN DE RESULTADOS ===');
    log(`DNS Resolution: ${dnsResult.success ? '✅ OK' : '❌ FAIL'}`);
    log(`Conexión Directa: ${directResult.success ? '✅ OK' : '❌ FAIL'}`);
    log(`Proxy Node.js: ${proxyResult.success ? '✅ OK' : '❌ FAIL'}`);
    log(`Proxy Playwright: ${playwrightProxyResult.success ? '✅ OK' : '❌ FAIL'}`);

    // Diagnóstico específico para Colombia/Venezuela
    if (playwrightProxyResult.success) {
      log('\n🇨🇴 DIAGNÓSTICO: Playwright con proxy Colombia funciona perfectamente!', 'success');
      log('   El problema de Redeban debería estar resuelto.');
    } else if (proxyResult.success && !playwrightProxyResult.success) {
      log('\n🔍 DIAGNÓSTICO: Proxy funciona en Node.js pero falla en Playwright.', 'error');
      log(`   Error Playwright: ${playwrightProxyResult.error}`);
      log('   REVISAR: Configuración de proxy en createOptimalBrowserContext()');
    } else if (!proxyResult.success) {
      log('\n❌ DIAGNÓSTICO: Proxy Oxylabs no responde.', 'error');
      log('   VERIFICAR: Credenciales en SSM Parameters o estado del servicio Oxylabs');
    } else if (directResult.success) {
      log('\n🇻🇪 DIAGNÓSTICO: Conexión directa funciona (ubicación Venezuela detectada).', 'success');
      log('   Para Redeban Colombia, debe usar proxy obligatoriamente.');
    }

    return {
      dns: dnsResult,
      direct: directResult,
      proxy: proxyResult,
      playwrightProxy: playwrightProxyResult,
      env: envVars
    };

  } catch (error) {
    log(`❌ Error ejecutando pruebas: ${error.message}`, 'error');
    throw error;
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runConnectivityTests()
    .then(() => {
      log('\n✅ Pruebas de conectividad completadas');
      process.exit(0);
    })
    .catch((error) => {
      log(`❌ Error en pruebas: ${error.message}`, 'error');
      process.exit(1);
    });
}

module.exports = { runConnectivityTests };
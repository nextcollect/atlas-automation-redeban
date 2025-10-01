#!/usr/bin/env node

/**
 * Script para verificar conectividad a puertos específicos desde Fargate
 * Diagnóstica si AWS bloquea el acceso al proxy Oxylabs
 */

const net = require('net');
const config = require('./src/modules/config');

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// Test conectividad a un puerto específico
async function testPortConnectivity(host, port, timeout = 10000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const startTime = Date.now();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ success: true, responseTime, port });
    });

    socket.on('timeout', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ success: false, error: 'TIMEOUT', responseTime, port });
    });

    socket.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ success: false, error: error.code || error.message, responseTime, port });
    });

    try {
      socket.connect(port, host);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      resolve({ success: false, error: error.message, responseTime, port });
    }
  });
}

// Test multiple puertos
async function testMultiplePorts(host, ports) {
  log(`🔍 Probando conectividad a ${host} en múltiples puertos...`);

  const results = [];
  for (const port of ports) {
    log(`Probando puerto ${port}...`);
    const result = await testPortConnectivity(host, port, 15000);

    if (result.success) {
      log(`✅ Puerto ${port}: Conectado (${result.responseTime}ms)`, 'success');
    } else {
      log(`❌ Puerto ${port}: ${result.error} (${result.responseTime}ms)`, 'error');
    }

    results.push(result);

    // Pequeña pausa entre tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

// Test puertos comunes de internet
async function testCommonPorts() {
  log('\n=== PRUEBA 1: Puertos Comunes de Internet ===');

  const commonPorts = [80, 443, 8080, 3128];
  const results = await testMultiplePorts('google.com', commonPorts);

  const workingPorts = results.filter(r => r.success);
  log(`\nResultado: ${workingPorts.length}/${commonPorts.length} puertos comunes funcionan`);

  return results;
}

// Test puertos específicos de Oxylabs
async function testOxylabsPorts() {
  log('\n=== PRUEBA 2: Puertos de Proxy Oxylabs ===');

  const proxyHost = config.proxyHost || 'pr.oxylabs.io';

  // Oxylabs usa múltiples puertos para diferentes servicios
  const oxylabsPorts = [
    7777, // Puerto configurado
    8000, // Puerto alternativo Oxylabs
    8001, // Puerto alternativo Oxylabs
    10000, // Puerto Enterprise Oxylabs
    10001  // Puerto Enterprise Oxylabs
  ];

  log(`Host objetivo: ${proxyHost}`);
  const results = await testMultiplePorts(proxyHost, oxylabsPorts);

  const workingPorts = results.filter(r => r.success);
  log(`\nResultado: ${workingPorts.length}/${oxylabsPorts.length} puertos Oxylabs funcionan`);

  if (workingPorts.length > 0) {
    log('✅ Puertos disponibles:', 'success');
    workingPorts.forEach(port => {
      log(`   - Puerto ${port.port} (${port.responseTime}ms)`);
    });
  }

  return results;
}

// Test DNS resolution para Oxylabs
async function testOxylabsDNS() {
  log('\n=== PRUEBA 3: Resolución DNS Oxylabs ===');

  const dns = require('dns');
  const hostname = config.proxyHost || 'pr.oxylabs.io';

  return new Promise((resolve) => {
    dns.lookup(hostname, (err, address, family) => {
      if (err) {
        log(`❌ Error DNS para ${hostname}: ${err.message}`, 'error');
        resolve({ success: false, error: err.message, hostname });
      } else {
        log(`✅ DNS resuelto: ${hostname} → ${address} (IPv${family})`, 'success');
        resolve({ success: true, address, family, hostname });
      }
    });
  });
}

// Test conectividad HTTP básica
async function testHTTPConnectivity() {
  log('\n=== PRUEBA 4: Conectividad HTTP Básica ===');

  const https = require('https');
  const testUrls = [
    'https://httpbin.org/ip',
    'https://api.ipify.org?format=json',
    'https://ip.oxylabs.io/location'
  ];

  const results = [];

  for (const url of testUrls) {
    log(`Probando ${url}...`);

    const result = await new Promise((resolve) => {
      const startTime = Date.now();

      const req = https.get(url, { timeout: 10000 }, (res) => {
        const responseTime = Date.now() - startTime;
        let data = '';

        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          log(`✅ ${url}: ${res.statusCode} (${responseTime}ms)`, 'success');
          resolve({ success: true, statusCode: res.statusCode, responseTime, url, data: data.substring(0, 200) });
        });
      });

      req.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        log(`❌ ${url}: ${error.message} (${responseTime}ms)`, 'error');
        resolve({ success: false, error: error.message, responseTime, url });
      });

      req.on('timeout', () => {
        const responseTime = Date.now() - startTime;
        req.destroy();
        log(`❌ ${url}: TIMEOUT (${responseTime}ms)`, 'error');
        resolve({ success: false, error: 'TIMEOUT', responseTime, url });
      });
    });

    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

// Función principal
async function runPortConnectivityTests() {
  log('🔍 Iniciando diagnóstico de conectividad de puertos desde Fargate');
  log('Objetivo: Determinar si AWS bloquea acceso a proxy Oxylabs');
  log('================================================\n');

  try {
    // Test DNS Oxylabs
    const dnsResult = await testOxylabsDNS();

    // Test puertos comunes
    const commonResults = await testCommonPorts();

    // Test puertos Oxylabs
    const oxylabsResults = await testOxylabsPorts();

    // Test HTTP básico
    const httpResults = await testHTTPConnectivity();

    // Análisis final
    log('\n=== DIAGNÓSTICO FINAL ===');

    const commonWorking = commonResults.filter(r => r.success).length;
    const oxylabsWorking = oxylabsResults.filter(r => r.success).length;
    const httpWorking = httpResults.filter(r => r.success).length;

    log(`DNS Oxylabs: ${dnsResult.success ? '✅ OK' : '❌ FAIL'}`);
    log(`Puertos comunes: ${commonWorking}/4 funcionan`);
    log(`Puertos Oxylabs: ${oxylabsWorking}/5 funcionan`);
    log(`Conectividad HTTP: ${httpWorking}/3 funcionan`);

    if (oxylabsWorking === 0 && commonWorking > 0) {
      log('\n🚫 DIAGNÓSTICO: AWS/Security Groups bloquean puertos de proxy', 'error');
      log('   SOLUCIÓN: Usar conexión directa o configurar Security Group para puerto 7777');
    } else if (oxylabsWorking > 0) {
      log('\n✅ DIAGNÓSTICO: Puertos proxy disponibles - problema en configuración Playwright', 'success');
      const workingPorts = oxylabsResults.filter(r => r.success);
      log(`   RECOMENDACIÓN: Usar puerto ${workingPorts[0].port} en lugar de 7777`);
    } else if (commonWorking === 0) {
      log('\n❌ DIAGNÓSTICO: Problema general de conectividad saliente', 'error');
      log('   VERIFICAR: NAT Gateway y configuración de red');
    }

    return {
      dns: dnsResult,
      common: commonResults,
      oxylabs: oxylabsResults,
      http: httpResults
    };

  } catch (error) {
    log(`❌ Error ejecutando diagnóstico: ${error.message}`, 'error');
    throw error;
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runPortConnectivityTests()
    .then(() => {
      log('\n✅ Diagnóstico de puertos completado');
      process.exit(0);
    })
    .catch((error) => {
      log(`❌ Error en diagnóstico: ${error.message}`, 'error');
      process.exit(1);
    });
}

module.exports = { runPortConnectivityTests };
/**
 * Test Node.js with Oxylabs proxy to see if it bypasses Redeban blocking
 */

const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { log } = require('./modules/logger');
const config = require('./modules/config');

/**
 * Test connectivity with Oxylabs proxy
 */
async function testWithProxy(url) {
  return new Promise((resolve) => {
    log('🇨🇴 Testing with Oxylabs proxy...', 'info');

    // Create proxy agent with authentication
    const proxyUrl = `http://${config.proxyUsername}:${config.proxyPassword}@${config.proxyHost}:${config.proxyPort}`;
    const agent = new HttpsProxyAgent(proxyUrl);

    log(`🔗 Proxy: ${config.proxyHost}:${config.proxyPort}`, 'info');
    log(`👤 User: ${config.proxyUsername?.substring(0, 20)}...`, 'info');

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      agent: agent, // Use proxy agent
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      log(`✅ Proxy response: ${res.statusCode}`, 'success');
      log(`📍 Via proxy headers:`, 'info');
      Object.keys(res.headers).forEach(key => {
        if (key.toLowerCase().includes('proxy') || key.toLowerCase().includes('x-')) {
          log(`   ${key}: ${res.headers[key]}`, 'info');
        }
      });

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const hasTitle = data.includes('Pagos Recurrentes');
        const hasLoginForm = data.includes('username') || data.includes('email') || data.includes('password');
        const isBlocked = data.includes('blocked') || data.includes('forbidden');

        log(`📄 Title found: ${hasTitle}`, hasTitle ? 'success' : 'info');
        log(`🔐 Login form found: ${hasLoginForm}`, hasLoginForm ? 'success' : 'info');
        log(`🚫 Blocked: ${isBlocked}`, isBlocked ? 'error' : 'success');
        log(`📦 Content length: ${data.length} bytes`, 'info');

        resolve({
          success: res.statusCode === 200 && hasTitle && !isBlocked,
          statusCode: res.statusCode,
          hasTitle,
          hasLoginForm,
          isBlocked,
          contentLength: data.length,
          method: 'nodejs-proxy'
        });
      });
    });

    req.on('error', (err) => {
      log(`❌ Proxy error: ${err.message}`, 'error');
      resolve({
        success: false,
        error: err.message,
        method: 'nodejs-proxy'
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Timeout with proxy',
        method: 'nodejs-proxy'
      });
    });

    req.end();
  });
}

/**
 * Compare direct vs proxy
 */
async function compareDirectVsProxy() {
  const url = 'https://pagosrecurrentes.redebandigital.com/pages/authentication/login-v1';

  log('🚀 Comparing direct vs proxy access...', 'step');

  // Test 1: Direct (we know this gives 403)
  log('\n--- Test 1: Direct Node.js ---', 'step');
  const directResult = await testDirect(url);
  log(`Direct result: ${JSON.stringify(directResult, null, 2)}`, 'info');

  // Test 2: With Oxylabs proxy
  log('\n--- Test 2: Node.js with Oxylabs Proxy ---', 'step');
  const proxyResult = await testWithProxy(url);
  log(`Proxy result: ${JSON.stringify(proxyResult, null, 2)}`, 'info');

  // Summary
  log('\n--- Comparison Summary ---', 'step');
  log(`Direct works: ${directResult.success}`, directResult.success ? 'success' : 'error');
  log(`Proxy works: ${proxyResult.success}`, proxyResult.success ? 'success' : 'error');

  if (proxyResult.success && !directResult.success) {
    log('🎉 Proxy bypasses the blocking! We can use Oxylabs.', 'success');
    return { useProxy: true, workingMethod: 'proxy' };
  } else if (directResult.success) {
    log('✅ Direct connection works, no proxy needed.', 'success');
    return { useProxy: false, workingMethod: 'direct' };
  } else {
    log('❌ Both methods failed. Need to investigate further.', 'error');
    return { useProxy: false, workingMethod: 'none' };
  }
}

/**
 * Test direct connection (for comparison)
 */
async function testDirect(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const hasTitle = data.includes('Pagos Recurrentes');
        resolve({
          success: res.statusCode === 200 && hasTitle,
          statusCode: res.statusCode,
          hasTitle,
          method: 'nodejs-direct'
        });
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message, method: 'nodejs-direct' });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout', method: 'nodejs-direct' });
    });

    req.end();
  });
}

// Run test
if (require.main === module) {
  compareDirectVsProxy().catch(console.error);
}

module.exports = {
  testWithProxy,
  compareDirectVsProxy
};
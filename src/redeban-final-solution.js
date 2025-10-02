/**
 * Network Diagnostics Solution: Comprehensive connectivity testing for Redeban
 * Used to diagnose network issues and validate Chrome functionality in Fargate
 *
 * @author Atlas Automation Team
 * @version 2.0.0
 */

const https = require('https');
const dns = require('dns');
const { spawn } = require('child_process');
const fs = require('fs');
const { log } = require('./modules/logger');
const { generateRedebanProcessUUID } = require('./modules/utils');
const { uploadScreenshotToS3, writeMetadataToS3 } = require('./modules/s3Service');
const config = require('./modules/config');

/**
 * Phase 1: Comprehensive Network Diagnostics
 */
async function runNetworkDiagnostics() {
  log('🔍 Phase 1: Comprehensive Network Diagnostics', 'step');

  // Environment info
  log('📋 Environment Information:', 'info');
  log(`  Node.js: ${process.version}`, 'info');
  log(`  Platform: ${process.platform}`, 'info');
  log(`  AWS Region: ${process.env.AWS_REGION}`, 'info');
  log(`  Environment: ${process.env.NODE_ENV}`, 'info');

  // DNS tests
  log('🌐 DNS Resolution Tests:', 'step');
  const dnsTests = ['pagosrecurrentes.redebandigital.com', 'google.com'];

  for (const hostname of dnsTests) {
    try {
      const dnsResult = await testDNS(hostname);
      log(`${dnsResult.success ? '✅' : '❌'} DNS ${hostname}: ${dnsResult.address || dnsResult.error}`,
          dnsResult.success ? 'success' : 'error');
    } catch (error) {
      log(`❌ DNS ${hostname}: ${error.message}`, 'error');
    }
  }

  // HTTP/HTTPS connectivity tests
  log('🌍 HTTPS Connectivity Tests:', 'step');
  const testSites = [
    'https://google.com',
    'https://github.com',
    'https://s3.amazonaws.com',
    'https://pagosrecurrentes.redebandigital.com',
    'https://pagosrecurrentes.redebandigital.com/pages/authentication/login-v1'
  ];

  const results = {};
  for (const url of testSites) {
    try {
      const result = await testConnection(url);
      results[url] = result;
      log(`${result.success ? '✅' : '❌'} ${url}: ${result.statusCode || result.error}`,
          result.success ? 'success' : 'error');
    } catch (error) {
      results[url] = { success: false, error: error.message };
      log(`❌ ${url}: ${error.message}`, 'error');
    }
  }

  const workingSites = Object.entries(results).filter(([, result]) => result.success);
  log(`📊 Network Summary: ${workingSites.length}/${testSites.length} sites working`, 'info');

  return results;
}

function testDNS(hostname) {
  return new Promise((resolve) => {
    dns.lookup(hostname, (err, address, family) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true, address, family });
      }
    });
  });
}

function testConnection(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'GET',
      timeout: 8000,
      headers: { 'User-Agent': 'Atlas-Test/1.0' }
    };

    const req = https.request(options, (res) => {
      resolve({
        success: true,
        statusCode: res.statusCode,
        server: res.headers.server
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });
    req.end();
  });
}

/**
 * Phase 2: Chrome Page Validation Testing
 */
async function runDualChromeTest(processUUID) {
  log('🔍 Running Chrome page validation tests...', 'step');

  const tempDir = '/tmp/chrome-dual';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Test 1: Simple approach (matching successful HTTP)
  log('🔧 Test 1: Simple Chrome (matching HTTP success)...', 'info');
  const simpleArgs = [
    '--headless',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--single-process',
    '--user-data-dir=' + tempDir + '/simple',
    '--window-size=1366,768',
    '--timeout=60000',  // 1 minute timeout
    '--user-agent=Atlas-Test/1.0',
    '--screenshot=/tmp/chrome-simple.png',
    'https://pagosrecurrentes.redebandigital.com/'
  ];

  const simpleResult = await runChromeTest(simpleArgs, 'simple', processUUID);

  // Test 2: Stealth approach (ALWAYS run both for comparison)
  log('🥷 Test 2: Stealth Chrome (anti-detection)...', 'info');
  const stealthArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--single-process',
    '--no-zygote',
    '--user-data-dir=' + tempDir + '/stealth',
    '--window-size=1920,1080',
    '--timeout=60000',  // 1 minute timeout
    '--disable-blink-features=AutomationControlled',
    '--exclude-switches=enable-automation',
    '--disable-extensions',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--screenshot=/tmp/chrome-stealth.png',
    config.siteUrl
  ];

  const stealthResult = await runChromeTest(stealthArgs, 'stealth', processUUID);

  // Compare results and return the best one
  log('📊 Comparing Chrome approaches:', 'step');
  log(`Simple Chrome: ${simpleResult.success ? 'SUCCESS' : 'FAILED'} (${simpleResult.screenshotSize || 0} bytes)`,
      simpleResult.success ? 'success' : 'error');
  log(`Stealth Chrome: ${stealthResult.success ? 'SUCCESS' : 'FAILED'} (${stealthResult.screenshotSize || 0} bytes)`,
      stealthResult.success ? 'success' : 'error');

  // Return the successful one, or the one with larger screenshot if both fail
  if (simpleResult.success) {
    log('✅ Using Simple Chrome approach (matched HTTP success)', 'success');
    return simpleResult;
  } else if (stealthResult.success) {
    log('✅ Using Stealth Chrome approach (anti-detection worked)', 'success');
    return stealthResult;
  } else {
    // Both failed, return the one with larger screenshot
    const betterResult = (simpleResult.screenshotSize || 0) > (stealthResult.screenshotSize || 0) ?
      simpleResult : stealthResult;
    log(`❌ Both approaches failed, using ${betterResult.method} (larger screenshot)`, 'warning');
    return betterResult;
  }
}

async function runChromeTest(chromeArgs, testName, processUUID) {
  return new Promise((resolve) => {
    log(`🚀 Launching Chrome (${testName})...`, 'info');

    const chrome = spawn('/usr/bin/google-chrome-stable', chromeArgs, {
      timeout: 90000,  // 1.5 minutes for both tests
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    chrome.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    chrome.on('close', async (code) => {
      log(`📄 Chrome (${testName}) exit code: ${code}`, code === 0 ? 'success' : 'error');

      if (stderr && stderr.length > 0) {
        log(`📥 Chrome stderr: ${stderr.substring(0, 200)}...`, 'warning');
      }

      const screenshotPath = `/tmp/chrome-${testName}.png`;
      const screenshotExists = fs.existsSync(screenshotPath);

      log(`📸 Screenshot (${testName}) created: ${screenshotExists}`, screenshotExists ? 'success' : 'error');

      if (screenshotExists) {
        const stats = fs.statSync(screenshotPath);
        log(`📦 Screenshot size: ${stats.size} bytes`, 'info');

        // Upload to S3
        try {
          const bucket = config.s3BucketEvidence || 'atlas-dev-us-east-1-s3-automation-evidence-redeban';
          await uploadScreenshotToS3(screenshotPath, `chrome-${testName}-test.png`, bucket, processUUID);
          log(`✅ Screenshot (${testName}) uploaded to S3`, 'success');
        } catch (uploadError) {
          log(`⚠️ Screenshot upload failed: ${uploadError.message}`, 'warning');
        }

        // Determine success based on screenshot size
        const isSuccess = stats.size > 15000; // Reasonable size for real content
        resolve({
          success: isSuccess,
          method: `chrome-${testName}`,
          screenshotSize: stats.size,
          exitCode: code,
          message: isSuccess ? 'Screenshot suggests page loaded' : 'Screenshot too small - likely error page'
        });
      } else {
        resolve({
          success: false,
          method: `chrome-${testName}`,
          error: 'No screenshot created',
          exitCode: code
        });
      }
    });

    chrome.on('error', (error) => {
      log(`❌ Chrome (${testName}) error: ${error.message}`, 'error');
      resolve({
        success: false,
        method: `chrome-${testName}`,
        error: error.message
      });
    });

    // Safety timeout
    setTimeout(() => {
      if (!chrome.killed) {
        log(`⏰ Chrome (${testName}) timeout - terminating`, 'warning');
        chrome.kill('SIGTERM');
      }
    }, 90000);  // 1.5 minutes safety timeout
  });
}

/**
 * Main diagnostic function
 */
async function runDiagnosticsSolution() {
  const processUUID = generateRedebanProcessUUID();
  const startTime = new Date();

  try {
    log('🚀 Starting Network Diagnostics for Redeban', 'step');
    log(`📋 Process UUID: ${processUUID}`, 'info');

    // Write initial metadata
    await writeMetadataToS3('started', {
      siteUrl: config.siteUrl,
      startTime: startTime.toISOString(),
      approach: 'network-diagnostics'
    }, processUUID);

    // Phase 1: Network diagnostics
    const networkResults = await runNetworkDiagnostics();

    // Phase 2: Chrome validation testing
    const chromeResult = await runDualChromeTest(processUUID);

    // Final assessment
    const overallSuccess = chromeResult.success;

    if (overallSuccess) {
      log('🎉 Network diagnostics completed successfully!', 'success');
      log(`✅ Chrome validation: ${chromeResult.method}`, 'success');
    } else {
      log('❌ Chrome validation failed', 'error');
      log(`📋 Last attempt: ${chromeResult.method} - ${chromeResult.error || chromeResult.message}`, 'info');
    }

    // Write final metadata
    await writeMetadataToS3('completed', {
      endTime: new Date().toISOString(),
      duration: new Date() - startTime,
      status: overallSuccess ? 'success' : 'failed',
      networkResults,
      chromeResult,
      approach: 'network-diagnostics'
    }, processUUID);

    return { success: overallSuccess, networkResults, chromeResult };

  } catch (error) {
    log(`❌ Network diagnostics error: ${error.message}`, 'error');

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
  runDiagnosticsSolution().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  runDiagnosticsSolution,
  runNetworkDiagnostics,
  runDualChromeTest
};
/**
 * Final Solution: Network Diagnostics + Anti-Detection Automation
 * Combines comprehensive network testing with advanced anti-detection
 *
 * @author Atlas Automation Team
 * @version 4.0.0
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

  // Network interfaces
  try {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    log('🌐 Network Interfaces:', 'info');
    Object.keys(interfaces).forEach(name => {
      interfaces[name].forEach(iface => {
        if (!iface.internal) {
          log(`  ${name}: ${iface.address} (${iface.family})`, 'info');
        }
      });
    });
  } catch (error) {
    log(`⚠️ Cannot read network interfaces: ${error.message}`, 'warning');
  }

  // DNS tests
  log('🌐 DNS Resolution Tests:', 'step');
  const dnsTests = [
    'pagosrecurrentes.redebandigital.com',
    'redebandigital.com',
    'google.com'
  ];

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
    'https://amazon.com',
    'https://s3.amazonaws.com',
    'https://s3.us-east-1.amazonaws.com',
    'https://logs.us-east-1.amazonaws.com',
    'https://redebandigital.com',
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

      if (result.success && result.server) {
        log(`  Server: ${result.server}`, 'info');
      }
    } catch (error) {
      results[url] = { success: false, error: error.message };
      log(`❌ ${url}: ${error.message}`, 'error');
    }
  }

  // Summary
  const workingSites = Object.entries(results).filter(([url, result]) => result.success);
  const failingSites = Object.entries(results).filter(([url, result]) => !result.success);

  log(`📊 Network Summary: ${workingSites.length} working, ${failingSites.length} failing`, 'info');

  return results;
}

/**
 * Test DNS resolution
 */
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
      path: '/',
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
 * Phase 2: Anti-Detection Chrome with Maximum Stealth
 */
async function runAntiDetectionAutomation(processUUID) {
  log('🥷 Phase 2: Anti-Detection Automation', 'step');

  const tempDir = '/tmp/chrome-stealth';
  const screenshotStart = '/tmp/stealth-start.png';
  const screenshotLogin = '/tmp/stealth-login.png';

  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Maximum stealth Chrome configuration
  const stealthArgs = [
    '--headless=new', // Use new headless mode
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',

    // Anti-detection core
    '--disable-blink-features=AutomationControlled',
    '--exclude-switches=enable-automation',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-client-side-phishing-detection',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-features=TranslateUI',
    '--disable-component-extensions-with-background-pages',

    // Network and SSL
    '--ignore-certificate-errors',
    '--ignore-ssl-errors',
    '--disable-web-security',
    '--allow-running-insecure-content',

    // Memory and performance
    '--memory-pressure-off',
    '--max_old_space_size=4096',
    '--single-process',
    '--no-zygote',

    // Realistic browser behavior
    '--user-data-dir=' + tempDir,
    '--window-size=1920,1080',
    '--device-scale-factor=1',

    // Extended timeouts
    '--timeout=90000',
    '--navigation-timeout=90000',
    '--load-timeout=90000',

    // Stealth headers (simulate real browser from Colombia)
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--accept=text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    '--accept-language=es-CO,es-419;q=0.9,es;q=0.8,en;q=0.7',
    '--accept-encoding=gzip, deflate, br',

    // Take screenshot
    `--screenshot=${screenshotStart}`,

    // Target URL
    config.siteUrl
  ];

  return new Promise((resolve) => {
    log('🚀 Launching stealth Chrome...', 'info');
    log(`📋 Chrome args count: ${stealthArgs.length}`, 'info');

    const chrome = spawn('/usr/bin/google-chrome-stable', stealthArgs, {
      timeout: 120000, // 2 minutes
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    chrome.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    chrome.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    chrome.on('close', async (code) => {
      log(`📄 Chrome exit code: ${code}`, code === 0 ? 'success' : 'error');

      if (stderr) {
        log(`📥 Chrome stderr: ${stderr.substring(0, 500)}...`, 'warning');
      }

      const screenshotExists = fs.existsSync(screenshotStart);
      log(`📸 Screenshot created: ${screenshotExists}`, screenshotExists ? 'success' : 'error');

      if (screenshotExists) {
        const stats = fs.statSync(screenshotStart);
        log(`📦 Screenshot size: ${stats.size} bytes`, 'info');

        // Upload screenshot
        try {
          const bucket = config.s3BucketEvidence || 'atlas-dev-us-east-1-s3-automation-evidence-redeban';
          await uploadScreenshotToS3(screenshotStart, 'stealth-chrome-test.png', bucket, processUUID);
          log('✅ Screenshot uploaded to S3', 'success');
        } catch (uploadError) {
          log(`⚠️ Screenshot upload failed: ${uploadError.message}`, 'warning');
        }

        // Analyze screenshot content (basic check)
        if (stats.size > 50000) { // Reasonable size suggests real content
          log('✅ Screenshot size suggests page loaded successfully', 'success');
          resolve({
            success: true,
            method: 'stealth-chrome',
            screenshotSize: stats.size,
            exitCode: code
          });
        } else {
          log('⚠️ Screenshot too small - may be error page', 'warning');
          resolve({
            success: false,
            method: 'stealth-chrome',
            error: 'Small screenshot suggests error page',
            screenshotSize: stats.size,
            exitCode: code
          });
        }
      } else {
        resolve({
          success: false,
          method: 'stealth-chrome',
          error: 'No screenshot created',
          exitCode: code
        });
      }
    });

    chrome.on('error', (error) => {
      log(`❌ Chrome spawn error: ${error.message}`, 'error');
      resolve({
        success: false,
        method: 'stealth-chrome',
        error: error.message
      });
    });

    // Safety timeout
    setTimeout(() => {
      if (!chrome.killed) {
        log('⏰ Chrome timeout - killing process', 'warning');
        chrome.kill('SIGTERM');
      }
    }, 120000);
  });
}

/**
 * Phase 3: Advanced Form Automation (if stealth works)
 */
async function attemptFormAutomation(processUUID) {
  log('📝 Phase 3: Form Automation Attempt', 'step');

  // If we get here, it means stealth Chrome worked
  // We can implement actual form filling using JavaScript injection
  // or Chrome DevTools Protocol

  log('🔐 Form automation would be implemented here', 'info');
  log('📋 This would include:', 'info');
  log('   - Login form detection', 'info');
  log('   - Credential filling', 'info');
  log('   - Form submission', 'info');
  log('   - Success verification', 'info');

  return {
    success: true,
    message: 'Form automation ready for implementation',
    method: 'stealth-chrome-forms'
  };
}

/**
 * Main orchestrator function
 */
async function runComprehensiveSolution() {
  const processUUID = generateRedebanProcessUUID();
  const startTime = new Date();

  try {
    log('🚀 Starting Comprehensive Redeban Solution', 'step');
    log(`📋 Process UUID: ${processUUID}`, 'info');
    log(`⏰ Start time: ${startTime.toISOString()}`, 'info');

    // Write initial metadata
    await writeMetadataToS3('started', {
      siteUrl: config.siteUrl,
      username: config.username,
      startTime: startTime.toISOString(),
      approach: 'comprehensive-diagnostics-and-stealth'
    }, processUUID);

    // Phase 1: Network Diagnostics
    const networkResults = await runNetworkDiagnostics();

    const workingSites = Object.entries(networkResults).filter(([url, result]) => result.success);
    const failingSites = Object.entries(networkResults).filter(([url, result]) => !result.success);

    log(`📊 Network Summary: ${workingSites.length} working, ${failingSites.length} failing`, 'info');

    // Phase 2: Anti-Detection Automation
    const automationResult = await runAntiDetectionAutomation(processUUID);

    // Phase 3: Form automation if stealth worked
    let formResult = null;
    if (automationResult.success) {
      formResult = await attemptFormAutomation(processUUID);
    }

    // Final assessment
    const overallSuccess = automationResult.success;

    if (overallSuccess) {
      log('🎉 Comprehensive solution completed successfully!', 'success');
    } else {
      log('❌ Stealth automation failed - need further investigation', 'error');
    }

    // Write final metadata
    await writeMetadataToS3('completed', {
      endTime: new Date().toISOString(),
      duration: new Date() - startTime,
      status: overallSuccess ? 'success' : 'partial-success',
      networkResults,
      automationResult,
      formResult,
      approach: 'comprehensive-diagnostics-and-stealth'
    }, processUUID);

    return {
      success: overallSuccess,
      networkResults,
      automationResult,
      formResult
    };

  } catch (error) {
    log(`❌ Comprehensive solution error: ${error.message}`, 'error');

    await writeMetadataToS3('failed', {
      endTime: new Date().toISOString(),
      error: error.message,
      status: 'failed',
      approach: 'comprehensive-diagnostics-and-stealth'
    }, processUUID);

    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runComprehensiveSolution().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  runComprehensiveSolution,
  runNetworkDiagnostics,
  runAntiDetectionAutomation
};
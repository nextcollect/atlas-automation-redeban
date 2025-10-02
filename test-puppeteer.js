/**
 * Test script to verify Puppeteer connectivity to Redeban
 * Run this locally to test before deploying to Fargate
 */

const puppeteer = require('puppeteer');

async function testPuppeteerConnectivity() {
  let browser = null;
  let page = null;

  try {
    console.log('🔧 Lanzando Puppeteer...');

    browser = await puppeteer.launch({
      headless: false, // Set to true for production
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--ignore-certificate-errors',
        '--disable-web-security'
      ]
    });

    page = await browser.newPage();

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('🌍 Navegando a Redeban...');
    const response = await page.goto('https://pagosrecurrentes.redebandigital.com/pages/authentication/login-v1', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log(`📄 Status: ${response.status()}`);
    console.log(`📄 URL: ${page.url()}`);

    const title = await page.title();
    console.log(`📄 Title: ${title}`);

    // Take screenshot
    await page.screenshot({ path: '/tmp/puppeteer-test.png', fullPage: true });
    console.log('📸 Screenshot saved to /tmp/puppeteer-test.png');

    // Check for specific elements
    try {
      await page.waitForSelector('input[type="email"], input[name="username"], #username', { timeout: 5000 });
      console.log('✅ Login form found');
    } catch (e) {
      console.log('❌ Login form not found');
    }

    console.log('✅ Test completado exitosamente');

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

// Run test
testPuppeteerConnectivity().catch(console.error);
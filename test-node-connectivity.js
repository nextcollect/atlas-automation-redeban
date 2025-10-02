/**
 * Test basic Node.js connectivity to Redeban (no browser)
 * This should work from Fargate since you mentioned Node.js direct works
 */

const https = require('https');
const http = require('http');

function testDirectConnectivity(url) {
  return new Promise((resolve, reject) => {
    console.log(`🔍 Testing connectivity to: ${url}`);

    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
        'Connection': 'close'
      },
      timeout: 15000
    };

    const req = protocol.request(options, (res) => {
      console.log(`✅ Status: ${res.statusCode}`);
      console.log(`📄 Headers:`, res.headers);

      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📦 Content length: ${data.length} bytes`);
        console.log(`🔍 Title check: ${data.includes('Pagos Recurrentes') ? 'FOUND' : 'NOT FOUND'}`);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          contentLength: data.length,
          hasTitle: data.includes('Pagos Recurrentes'),
          success: res.statusCode === 200 || res.statusCode === 403
        });
      });
    });

    req.on('error', (err) => {
      console.error(`❌ Request error: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      console.error(`❌ Request timeout`);
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runConnectivityTests() {
  console.log('🚀 Starting Node.js connectivity tests...\n');

  const urls = [
    'https://pagosrecurrentes.redebandigital.com/pages/authentication/login-v1',
    'https://pagosrecurrentes.redebandigital.com',
    'https://google.com' // Control test
  ];

  for (const url of urls) {
    try {
      console.log(`\n--- Testing: ${url} ---`);
      const result = await testDirectConnectivity(url);
      console.log(`✅ Test passed: ${result.success ? 'YES' : 'NO'}`);
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
    console.log('---\n');
  }
}

// Run tests
runConnectivityTests().catch(console.error);
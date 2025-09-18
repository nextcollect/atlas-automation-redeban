const {chromium} = require('playwright');
const fs = require('fs');
require('dotenv').config();
const {S3Client, PutObjectCommand, GetObjectCommand} = require('@aws-sdk/client-s3');

const SITE_URL = process.env.SITE_URL;
const USERNAME = process.env.SITE_USERNAME;
const PASSWORD = process.env.SITE_PASSWORD;
const S3_BUCKET_INPUT = process.env.S3_BUCKET_INPUT;
const S3_KEY_INPUT = process.env.S3_KEY_INPUT;
const S3_BUCKET_EVIDENCE = process.env.S3_BUCKET_EVIDENCE;
const S3_KEY_PREFIX = process.env.S3_KEY_PREFIX;

function waitForOTPFromConsole() {
  return new Promise(resolve => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Enter the OTP received: ', otp => {
      rl.close();
      resolve(otp.trim());
    });
  });
}

async function uploadScreenshotToS3(filePath, filename) {
  const s3 = new S3Client({region: 'us-east-1'});
  const body = fs.readFileSync(filePath);
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_EVIDENCE,
    Key: `${S3_KEY_PREFIX}/${filename}`,
    Body: body,
    ContentType: 'image/png'
  });
  await s3.send(command);
  console.log(`Screenshot uploaded to s3://${S3_BUCKET_EVIDENCE}/${S3_KEY_PREFIX}/${filename}`);
}

async function takeScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}-${timestamp}.png`;
  const filePath = `/tmp/${filename}`;
  await page.screenshot({path: filePath, fullPage: true});
  await uploadScreenshotToS3(filePath, filename);
}

async function downloadInputFileFromS3(localPath) {
  const s3 = new S3Client({region: 'us-east-1'});
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_INPUT,
    Key: S3_KEY_INPUT
  });

  const response = await s3.send(command);
  const stream = response.Body;
  const writable = fs.createWriteStream(localPath);
  return new Promise((resolve, reject) => {
    stream.pipe(writable);
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

async function uploadFile() {
  console.log('Starting Redeban automation...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ignoreHTTPSErrors: true});
  const page = await context.newPage();

  try {
    await page.goto(SITE_URL, {waitUntil: 'networkidle'});
    await takeScreenshot(page, 'initial-page');

    await page.fill('input[name="f_username"]', USERNAME);
    await page.fill('input[name="f_password"]', PASSWORD);
    await takeScreenshot(page, 'login-form-completed');

    await page.click('button:has-text("Ingresar")');
    await page.waitForSelector('input[name="f_codigo"]', {timeout: 15000});

    const otp = await waitForOTPFromConsole();
    await page.fill('input[name="f_codigo"]', otp);
    await takeScreenshot(page, 'otp-submitted');

    await page.click('button:has-text("Ingresar")');
    await page.waitForNavigation({waitUntil: 'networkidle'});

    if (await page.isVisible('text="Error de autenticación"')) {
      await takeScreenshot(page, 'login-failed');
      console.log('Authentication error. Please check credentials or OTP.');
      return;
    }

    await takeScreenshot(page, 'after-login');

    await page.goto('https://pagosrecurrentes.redebandigital.com/pages/carga');
    await page.waitForSelector('input[type="file"]', {timeout: 15000});
    await takeScreenshot(page, 'file-upload-page');

    const inputFileLocalPath = '/tmp/input-redeban.csv';
    await downloadInputFileFromS3(inputFileLocalPath);
    await page.setInputFiles('input[type="file"]', inputFileLocalPath);
    await takeScreenshot(page, 'file-selected');

    await Promise.all([
      page.waitForSelector('.success-message', {timeout: 15000}),
      page.click('button:has-text("Subir archivo")')
    ]);
    await takeScreenshot(page, 'upload-success');

    console.log('File uploaded successfully.');
  } catch (error) {
    console.error('Automation error:', error);
    await takeScreenshot(page, 'error-state');
  } finally {
    await browser.close();
    console.log('Browser closed. Automation complete.');
  }
}

uploadFile().catch(console.error);

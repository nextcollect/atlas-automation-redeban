const {S3Client, PutObjectCommand, GetObjectCommand} = require('@aws-sdk/client-s3');
const fs = require('fs');

async function uploadScreenshotToS3(filePath, filename, bucket, keyPrefix) {
  const s3 = new S3Client({region: process.env.AWS_REGION || 'us-east-1'});
  const body = fs.readFileSync(filePath);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: `${keyPrefix}/${filename}`,
    Body: body,
    ContentType: 'image/png'
  });
  await s3.send(command);
  console.log(`Screenshot uploaded to s3://${bucket}/${keyPrefix}/${filename}`);
}

async function downloadInputFileFromS3(bucket, key, localPath) {
  const s3 = new S3Client({region: process.env.AWS_REGION || 'us-east-1'});
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
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

module.exports = {
  uploadScreenshotToS3,
  downloadInputFileFromS3
};

# Atlas Redeban Automation

Automated file upload and processing for Redeban platform using Playwright.

## Features

- Automated browser interaction with Redeban platform
- AWS S3 integration for file processing
- Screenshot evidence capture
- Comprehensive logging and error handling
- Docker containerization for ECS deployment

## Development

```bash
# Setup development environment
npm install
npm run setup

# For local development (copy .env.example to .env and configure)
cp .env.example .env
npm start
```

## Testing

```bash
npm test
npm run lint
```

## Docker

```bash
npm run docker:build
npm run docker:run
```

## Deployment

Automated deployment via GitHub Actions to AWS ECS.

## Configuration

### Production (ECS)
Configuration is handled via:
- **Environment Variables**: Set in ECS Task Definition
- **Secrets**: Stored in AWS Parameter Store and referenced in Task Definition
- **IAM Roles**: ECS Task Role provides AWS permissions

### Local Development
Copy `.env.example` to `.env` and configure:
- `SITE_URL`: Target platform URL
- `SITE_USERNAME`: Login username
- `SITE_PASSWORD`: Login password
- `S3_BUCKET_INPUT`: S3 bucket for input files
- `S3_BUCKET_EVIDENCE`: S3 bucket for evidence storage
- `AWS_REGION`: AWS region
- `PROXY_HOST`: Proxy server host (if required)
- `PROXY_PORT`: Proxy server port (if required)

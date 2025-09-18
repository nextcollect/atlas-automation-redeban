#!/bin/bash

set -e

# Configuration
CLUSTER_NAME="atlas-cluster"
SERVICE_NAME="atlas-SERVICE_NAME-service"
TASK_DEFINITION="atlas-SERVICE_NAME"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Deploy to ECS
log "Deploying to ECS..."

# Register new task definition
TASK_DEF_ARN=$(aws ecs register-task-definition \
    --cli-input-json file://infrastructure/ecs-task-definition.json \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

log "Registered task definition: $TASK_DEF_ARN"

# Update service
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --task-definition $TASK_DEF_ARN

log "Waiting for deployment to complete..."

# Wait for service to stabilize
aws ecs wait services-stable \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME

log "Deployment completed successfully!"

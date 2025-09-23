#!/bin/bash

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Configuration
AWS_REGION="us-east-1"
PARAMETER_PREFIX="/atlas/redeban"

log "Configurando parámetros SSM para Redeban..."

# Verificar que AWS CLI esté configurado
if ! aws sts get-caller-identity &>/dev/null; then
    error "AWS CLI no está configurado. Ejecuta 'aws configure' primero."
fi

info "Región: $AWS_REGION"
info "Prefijo de parámetros: $PARAMETER_PREFIX"

# Función para crear parámetro seguro
create_secure_parameter() {
    local name="$1"
    local value="$2"
    local description="$3"

    log "Creando parámetro seguro: $name"

    # Intentar crear parámetro nuevo primero
    if aws ssm put-parameter \
        --region "$AWS_REGION" \
        --name "$name" \
        --value "$value" \
        --description "$description" \
        --type "SecureString" \
        --tags "Key=Project,Value=Atlas" "Key=Service,Value=Redeban" "Key=Environment,Value=Development" &>/dev/null; then
        info "✅ Parámetro creado: $name"
    else
        # Si falla, intentar actualizar existente
        aws ssm put-parameter \
            --region "$AWS_REGION" \
            --name "$name" \
            --value "$value" \
            --description "$description" \
            --type "SecureString" \
            --overwrite
        info "🔄 Parámetro actualizado: $name"
    fi
}

# Función para crear parámetro normal
create_parameter() {
    local name="$1"
    local value="$2"
    local description="$3"

    log "Creando parámetro: $name"

    # Intentar crear parámetro nuevo primero
    if aws ssm put-parameter \
        --region "$AWS_REGION" \
        --name "$name" \
        --value "$value" \
        --description "$description" \
        --type "String" \
        --tags "Key=Project,Value=Atlas" "Key=Service,Value=Redeban" "Key=Environment,Value=Development" &>/dev/null; then
        info "✅ Parámetro creado: $name"
    else
        # Si falla, intentar actualizar existente
        aws ssm put-parameter \
            --region "$AWS_REGION" \
            --name "$name" \
            --value "$value" \
            --description "$description" \
            --type "String" \
            --overwrite
        info "🔄 Parámetro actualizado: $name"
    fi
}

# Crear parámetros sensibles (SecureString)
create_secure_parameter "$PARAMETER_PREFIX/username" "lguio@unicef.org" "Redeban portal username"
create_secure_parameter "$PARAMETER_PREFIX/password" "Unicef.20250629*" "Redeban portal password"
create_secure_parameter "$PARAMETER_PREFIX/proxy-username" "customer-sroma29_uP9v3-cc-co-city-bucaramanga-sessid-0292027377-sesstime-6" "Oxylabs proxy username"
create_secure_parameter "$PARAMETER_PREFIX/proxy-password" "728hv_b8XjfCr" "Oxylabs proxy password"

# Crear parámetros no sensibles (String)
create_parameter "$PARAMETER_PREFIX/site-url" "https://pagosrecurrentes.redebandigital.com/pages/authentication/login-v1" "Redeban portal URL"
create_parameter "$PARAMETER_PREFIX/s3-bucket-input" "atlas-dev-us-east-1-s3-files-detokenized" "S3 bucket for input files"
create_parameter "$PARAMETER_PREFIX/s3-key-input" "output/detokenized-unicef-colombia-redeban.csv" "S3 key for input file"
create_parameter "$PARAMETER_PREFIX/s3-bucket-evidence" "atlas-dev-us-east-1-s3-automation-evidence-redeban" "S3 bucket for evidence/screenshots"
create_parameter "$PARAMETER_PREFIX/s3-key-prefix" "unicef/colombia/redeban" "S3 key prefix for organization"
create_parameter "$PARAMETER_PREFIX/proxy-host" "pr.oxylabs.io" "Oxylabs proxy hostname"
create_parameter "$PARAMETER_PREFIX/proxy-port" "7777" "Oxylabs proxy port"

log "✅ Todos los parámetros SSM han sido configurados exitosamente!"

# Mostrar resumen
echo ""
info "Parámetros creados:"
aws ssm get-parameters-by-path \
    --region "$AWS_REGION" \
    --path "$PARAMETER_PREFIX" \
    --recursive \
    --query 'Parameters[*].[Name,Type]' \
    --output table

echo ""
log "🔐 Para verificar un parámetro seguro:"
echo "aws ssm get-parameter --region $AWS_REGION --name '$PARAMETER_PREFIX/username' --with-decryption"

echo ""
log "📋 Para ver todos los parámetros:"
echo "aws ssm get-parameters-by-path --region $AWS_REGION --path '$PARAMETER_PREFIX' --recursive"
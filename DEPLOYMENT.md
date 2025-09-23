# Atlas Redeban Automation - Deployment Guide

## 🔐 Configuración Segura con AWS SSM Parameter Store

Este proyecto usa AWS Systems Manager Parameter Store para manejar credenciales y configuración de manera segura.

### Prerequisitos

1. **AWS CLI configurado** con permisos para:
   - SSM (Parameter Store)
   - ECS (Elastic Container Service)
   - ECR (Elastic Container Registry)
   - IAM (para roles)

2. **Permisos IAM necesarios** para el execution role:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ssm:GetParameters",
           "ssm:GetParameter",
           "ssm:GetParametersByPath"
         ],
         "Resource": "arn:aws:ssm:us-east-1:897722707908:parameter/atlas/redeban/*"
       }
     ]
   }
   ```

### 🚀 Setup Inicial

#### 1. Configurar parámetros en SSM Parameter Store

```bash
# Ejecutar el script de configuración
./scripts/setup-ssm-parameters.sh
```

Este script creará los siguientes parámetros:

**Parámetros Seguros (SecureString):**
- `/atlas/redeban/username` - Usuario del portal Redeban
- `/atlas/redeban/password` - Contraseña del portal Redeban
- `/atlas/redeban/proxy-username` - Usuario del proxy Oxylabs
- `/atlas/redeban/proxy-password` - Contraseña del proxy Oxylabs

**Parámetros Estándar (String):**
- `/atlas/redeban/site-url` - URL del portal Redeban
- `/atlas/redeban/s3-bucket-input` - Bucket S3 para archivos de entrada
- `/atlas/redeban/s3-key-input` - Key S3 para archivo de entrada
- `/atlas/redeban/s3-bucket-evidence` - Bucket S3 para capturas
- `/atlas/redeban/s3-key-prefix` - Prefijo para organización S3
- `/atlas/redeban/proxy-host` - Host del proxy Oxylabs
- `/atlas/redeban/proxy-port` - Puerto del proxy Oxylabs

#### 2. Verificar parámetros

```bash
# Ver todos los parámetros
aws ssm get-parameters-by-path \
  --region us-east-1 \
  --path "/atlas/redeban" \
  --recursive \
  --output table

# Ver un parámetro específico (con descifrado)
aws ssm get-parameter \
  --region us-east-1 \
  --name "/atlas/redeban/username" \
  --with-decryption
```

### 🐳 Deployment

#### 1. Deploy via GitHub Actions

El workflow `.github/workflows/deploy-to-ecs.yml` se ejecuta automáticamente al hacer push a `main` o `development`.

#### 2. Deploy manual

```bash
# Registrar nueva task definition
./scripts/deploy.sh
```

### 🔧 Desarrollo Local

Para desarrollo local, usa el archivo `nodemon.json` (NO incluido en Git):

```json
{
  "watch": ["src"],
  "ext": "js,json",
  "env": {
    "SITE_USERNAME": "tu-usuario-aqui",
    "SITE_PASSWORD": "tu-password-aqui",
    // ... resto de variables
  }
}
```

### 📋 Recursos AWS Necesarios

#### ECS Resources:
- **Cluster:** `atlas-cluster`
- **Service:** `atlas-redeban-service`
- **Task Definition:** `atlas-dev-us-east-1-task-redeban`

#### IAM Roles:
- **Execution Role:** `atlas-dev-us-east-1-role-ecs-task-cmdctr`
- **Task Role:** `atlas-dev-us-east-1-role-ecs-task-cmdctr`

#### ECR Repository:
- `atlas-automation-redeban`

#### CloudWatch Logs:
- **Log Group:** `/ecs/atlas-dev-us-east-1-log-redeban`

### 🔍 Troubleshooting

#### Error: Unable to retrieve secret from SSM

1. Verificar que los parámetros existen:
   ```bash
   aws ssm get-parameters-by-path --path "/atlas/redeban" --recursive
   ```

2. Verificar permisos del execution role
3. Verificar región (debe ser `us-east-1`)

#### Error: Task stopped with error

1. Revisar logs en CloudWatch:
   - Log Group: `/ecs/atlas-dev-us-east-1-log-redeban`

2. Verificar que el ECR repository existe y la imagen está presente

### 🔐 Seguridad

- ✅ Credenciales están en SSM Parameter Store (encriptadas)
- ✅ `nodemon.json` está en `.gitignore`
- ✅ Task definition solo tiene referencias a SSM, no valores reales
- ✅ Logs no exponen credenciales

### 📝 Notas

- Los parámetros SSM se pueden actualizar sin rebuild de la imagen Docker
- Para cambiar credenciales, solo actualiza el parámetro SSM y reinicia el servicio ECS
- El proxy Oxylabs tiene sessions limitadas, actualizar `proxy-username` periódicamente
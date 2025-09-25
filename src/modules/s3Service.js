/**
 * S3 Service Module for Redeban Automation
 *
 * Advanced S3 service based on Credibanco architecture with enhanced functionality
 * for waiting on processed files, robust error handling, and comprehensive logging.
 * Files are organized under redeban-specific directories for clear separation.
 *
 * @author Atlas Automation Team
 * @version 2.0.0
 * @module s3Service
 */

const fs = require('fs');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const {log} = require('./logger');
const path = require('path');

const s3 = new S3Client({region: 'us-east-1'});

/**
 * Validates if a file is intended for Redeban processing
 * Files must contain '@redeban' in their name to be processed by Redeban
 *
 * @function isRedebanFile
 * @param {string} filename - The filename to validate
 * @returns {boolean} True if file is for Redeban processing
 */
function isRedebanFile(filename) {
  return filename.includes('@redeban');
}

async function waitForDetokenizedFile(key, maxAttempts = 30) {
  let attempts = 0;

  // Extraer UUID del key (formato: UUID/input-file.ext)
  const processUUID = key.split('/')[0];
  const detokenizedKey = `${processUUID}/processed-file.${key.split('.').pop()}`;

  log(`Buscando archivo detokenizado para proceso UUID: ${processUUID}`);
  log(`Key esperada: ${detokenizedKey}`);
  log(`Bucket principal: atlas-dev-us-east-1-s3-files-detokenized`);
  log(`Filtrando archivos que contengan '@redeban' en el nombre`, 'info');

  while (attempts < maxAttempts) {
    try {
      // Primero, intentar obtener el archivo específico directamente
      try {
        log(`Intentando obtener archivo específico: ${detokenizedKey}`);
        const headCommand = new HeadObjectCommand({
          Bucket: 'atlas-dev-us-east-1-s3-files-detokenized-redeban',
          Key: detokenizedKey
        });

        await s3.send(headCommand);
        log(`Archivo detokenizado encontrado directamente: ${detokenizedKey}`, 'success');
        return detokenizedKey;
      } catch (headError) {
        if (headError.name === 'NotFound') {
          log(`Archivo específico ${detokenizedKey} no encontrado, buscando en el directorio del UUID...`);
        } else {
          log(`Error al verificar archivo específico: ${headError.message}`);
        }
      }

      // Si no se encuentra el archivo específico, listar archivos en el directorio del UUID
      log(`Listando archivos en el directorio del UUID: ${processUUID}/`);
      const listCommand = new ListObjectsV2Command({
        Bucket: 'atlas-dev-us-east-1-s3-files-detokenized',
        Prefix: `${processUUID}/`,
        MaxKeys: 10
      });

      const response = await s3.send(listCommand);
      log(`Total de archivos encontrados en bucket: ${response.Contents?.length || 0}`);

      if (!response.Contents || response.Contents.length === 0) {
        attempts++;
        log(`Directorio UUID vacío (intento ${attempts}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      // Filtrar archivos que contengan '@redeban' en el nombre
      const redebanFiles = response.Contents.filter(file => isRedebanFile(file.Key));

      log(`Archivos totales en directorio ${processUUID}/: ${response.Contents.length}`);
      log(`Archivos con '@redeban' encontrados: ${redebanFiles.length}`);

      // Mostrar archivos filtrados para debugging
      if (redebanFiles.length > 0) {
        log(`Archivos Redeban en el directorio ${processUUID}/:`);
        redebanFiles.forEach((file, index) => {
          log(`  ${index + 1}. ${file.Key} (${file.Size} bytes, ${file.LastModified})`);
        });
      }

      // Buscar archivos procesados específicos de Redeban
      log(`Buscando archivos procesados de Redeban en directorio: ${processUUID}/`);

      const processedFiles = redebanFiles.filter(
        file => (file.Key.startsWith(`${processUUID}/processed-file.`) && isRedebanFile(file.Key)) ||
                (file.Key.startsWith(`${processUUID}/`) && !file.Key.includes('input-file.') && isRedebanFile(file.Key))
      );

      log(`Archivos procesados encontrados: ${processedFiles.length}`);
      processedFiles.forEach((file, index) => {
        log(`  ${index + 1}. ${file.Key} (${file.Size} bytes, ${file.LastModified})`);
      });

      if (processedFiles.length > 0) {
        // Ordenar por fecha más reciente
        processedFiles.sort((a, b) => b.LastModified - a.LastModified);
        const latestFile = processedFiles[0];
        log(`Archivo detokenizado seleccionado: ${latestFile.Key}`, 'success');
        log(`Fecha de modificación: ${latestFile.LastModified}`);
        return latestFile.Key;
      }

      // Si no hay coincidencias, usar cualquier archivo Redeban en el directorio UUID
      const anyFiles = redebanFiles.filter(file =>
        file.Key.startsWith(`${processUUID}/`) &&
        !file.Key.endsWith('/') &&
        (file.Key.endsWith('.csv') || file.Key.endsWith('.txt')) &&
        isRedebanFile(file.Key)
      ).sort((a, b) => b.LastModified - a.LastModified);

      if (anyFiles.length > 0) {
        const latestFile = anyFiles[0];
        log(`Usando archivo más reciente en directorio UUID: ${latestFile.Key}`, 'success');
        log(`Fecha de modificación: ${latestFile.LastModified}`);
        return latestFile.Key;
      }

      attempts++;
      log(`No se encontraron archivos Redeban apropiados en ${processUUID}/ (intento ${attempts}/${maxAttempts})`);
      log(`Nota: Solo se procesan archivos que contengan '@redeban' en el nombre`, 'warning');
      await new Promise(r => setTimeout(r, 10000));
    } catch (error) {
      log(`Error al listar archivos en S3: ${error.message}`, 'error');
      log(`Error code: ${error.name}`, 'error');

      // Si es un error de permisos KMS, dar información específica
      if (error.name === 'AccessDenied' || error.message.includes('KMS') || error.message.includes('encryption')) {
        log(`Posible problema de permisos KMS. Verificar que el rol tenga permisos para:`, 'error');
        log(`  - kms:Decrypt`, 'error');
        log(`  - kms:DescribeKey`, 'error');
        log(`  - s3:GetObject`, 'error');
        log(`  - s3:ListBucket`, 'error');
      }

      attempts++;
      log(`Esperando archivo detokenizado... (intento ${attempts}/${maxAttempts})`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  throw new Error(`Timeout esperando archivo detokenizado después de ${maxAttempts} intentos`);
}

async function downloadInputFileFromS3(key) {
  log(`Iniciando descarga del archivo: ${key}`);

  // Validar que el archivo sea para Redeban
  if (!isRedebanFile(key)) {
    log(`ADVERTENCIA: El archivo '${key}' no contiene '@redeban' en el nombre`, 'warning');
    log(`Solo se procesan archivos con formato: archivo@redeban.ext`, 'warning');
    log(`Archivos sin '@redeban' se procesan como Credibanco por defecto`, 'info');
  }

  const detokenizedKey = await waitForDetokenizedFile(key);

  // Validar que el archivo encontrado sea realmente para Redeban
  if (!isRedebanFile(detokenizedKey)) {
    throw new Error(`El archivo encontrado '${detokenizedKey}' no es válido para Redeban. Debe contener '@redeban' en el nombre.`);
  }

  log(`Descargando archivo de S3: ${detokenizedKey}`, 'step');
  log(`Archivo validado como Redeban: ✅`, 'success');
  const url = `https://s3.console.aws.amazon.com/s3/object/atlas-dev-us-east-1-s3-files-detokenized?prefix=${detokenizedKey}`;
  log(`URL completa en S3: ${url}`);

  try {
    const command = new GetObjectCommand({
      Bucket: 'atlas-dev-us-east-1-s3-files-detokenized',
      Key: detokenizedKey
    });

    log(`Enviando comando GetObject para: ${detokenizedKey}`);
    const response = await s3.send(command);
    log(`Archivo obtenido exitosamente de S3`);

    const filePath = `/tmp/${path.basename(detokenizedKey)}`;
    log(`Guardando archivo localmente en: ${filePath}`);

    const writable = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      response.Body.pipe(writable);
      response.Body.on('error', reject);
      writable.on('finish', resolve);
    });

    log(`Archivo descargado exitosamente: ${filePath}`);
    return filePath;
  } catch (error) {
    log(`Error al obtener archivo de S3: ${error.message}`, 'error');
    log(`Error code: ${error.name}`, 'error');
    log(`Bucket: atlas-dev-us-east-1-s3-files-detokenized`, 'error');
    log(`Key: ${detokenizedKey}`, 'error');
    log(`URL completa: ${url}`, 'error');

    // Información específica para errores de KMS
    if (error.name === 'AccessDenied' || error.message.includes('KMS') || error.message.includes('encryption')) {
      log(`Error de permisos KMS detectado. Verificar:`, 'error');
      log(`  1. El rol de la tarea ECS tiene permisos kms:Decrypt`, 'error');
      log(`  2. El rol de la tarea ECS tiene permisos kms:DescribeKey`, 'error');
      log(`  3. El rol de la tarea ECS tiene permisos s3:GetObject`, 'error');
      log(`  4. La clave KMS está configurada correctamente en el bucket`, 'error');
    }

    throw error;
  }
}

async function uploadScreenshotToS3(filePath, filename, bucket, processUUID) {
  const key = `redeban/${processUUID}/screenshots/${filename}`;
  const body = fs.readFileSync(filePath);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'image/png'
  });
  await s3.send(command);
  log(`Captura guardada: ${key}`);
}

async function writeMetadataToS3(status, details, processUUID) {
  const timestamp = new Date().toISOString();

  // Usar el processUUID directamente
  if (!processUUID) {
    processUUID = `redeban-process-${timestamp.replace(/[:.]/g, '-')}`;
    log(`No se proporcionó processUUID, generando uno temporal: ${processUUID}`, 'warning');
  }

  const metadata = {
    timestamp,
    status,
    details,
    processUUID,
    service: 'redeban',
    environment: process.env.NODE_ENV || 'development'
  };

  const key = `redeban/${processUUID}/metadata.json`;
  const command = new PutObjectCommand({
    Bucket: 'atlas-dev-us-east-1-s3-cmdctr-metadata', // Bucket específico para Redeban metadata
    Key: key,
    Body: JSON.stringify(metadata, null, 2),
    ContentType: 'application/json'
  });

  try {
    await s3.send(command);
    log(`Metadata escrita en S3: ${key}`);
    return key;
  } catch (error) {
    log(`Error al escribir metadata: ${error.message}`, 'error');
    throw error;
  }
}

async function uploadLogToS3(logData, filename, bucket, processUUID) {
  try {
    if (!bucket || !processUUID) {
      log('Bucket or processUUID not provided, skipping S3 upload', 'warning');
      return;
    }

    const key = `redeban/${processUUID}/logs/${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: logData,
      ContentType: 'text/plain'
    });

    await s3.send(command);
    log(`Log uploaded to s3://${bucket}/${key}`, 'success');
    return key;
  } catch (error) {
    log(`Error uploading log to S3: ${error.message}`, 'error');
    throw error;
  }
}

async function uploadInputFileToS3(filePath, bucket, processUUID) {
  try {
    if (!bucket || !processUUID) {
      log('Bucket or processUUID not provided, skipping S3 upload', 'warning');
      return;
    }

    const body = fs.readFileSync(filePath);
    const filename = `input-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    const key = `redeban/${processUUID}/input/${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'text/csv'
    });

    await s3.send(command);
    log(`Input file uploaded to s3://${bucket}/${key}`, 'success');
    return key;
  } catch (error) {
    log(`Error uploading input file to S3: ${error.message}`, 'error');
    throw error;
  }
}

module.exports = {
  waitForDetokenizedFile,
  downloadInputFileFromS3,
  uploadScreenshotToS3,
  writeMetadataToS3,
  uploadLogToS3,
  uploadInputFileToS3,
  isRedebanFile
};

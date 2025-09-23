/**
 * Logging Module for Redeban Automation
 *
 * Provides structured logging with categorized message types and automatic
 * prefix detection. Supports multiple log levels and clean message formatting.
 *
 * @author Atlas Automation Team
 * @version 1.0.0
 * @module logger
 */

/**
 * Logs a message with appropriate categorization and formatting
 * Automatically detects message type from content and applies consistent prefixes
 *
 * @function log
 * @param {string} message - The message to log
 * @param {string} [type='info'] - Log type: 'info', 'success', 'error', 'warning', 'step'
 * @returns {void}
 *
 * @example
 * log('Starting process...', 'step');
 * // Output: [STEP] Starting process...
 *
 * log('Operation completed successfully', 'success');
 * // Output: [SUCCESS] Operation completed successfully
 */
function log(message, type = 'info') {
  let cleanMessage = message;
  if (message.startsWith('[')) {
    const endBracket = message.indexOf(']');
    if (endBracket !== -1) {
      cleanMessage = message.substring(endBracket + 1).trim();
    }
  }

  let logType = type;
  if (message.includes('[SUCCESS]')) logType = 'success';
  else if (message.includes('[ERROR]')) logType = 'error';
  else if (message.includes('[WARNING]')) logType = 'warning';
  else if (message.includes('[STEP]')) logType = 'step';

  const prefix =
    {
      info: '[INFO]',
      success: '[SUCCESS]',
      error: '[ERROR]',
      warning: '[WARNING]',
      step: '[STEP]'
    }[logType] || '[INFO]';

  if (!cleanMessage.startsWith('[')) {
    console.log(`${prefix} ${cleanMessage}`);
  } else {
    console.log(cleanMessage);
  }
}

/**
 * Uploads a log message to S3 (currently just logs locally)
 * Future enhancement point for S3 log storage integration
 *
 * @async
 * @function uploadLogMessageToS3
 * @param {string} message - The log message to upload
 * @returns {Promise<void>}
 */
async function uploadLogMessageToS3(message) {
  log(message);
}

module.exports = {
  log,
  uploadLogMessageToS3
};

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const levelColors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    warning: '\x1b[33m', // Yellow
    error: '\x1b[31m',   // Red
    step: '\x1b[35m'     // Magenta
  };

  const color = levelColors[level] || '\x1b[0m';
  const reset = '\x1b[0m';

  console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}`);
}

module.exports = { log };

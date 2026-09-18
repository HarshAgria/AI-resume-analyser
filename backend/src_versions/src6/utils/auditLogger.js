const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');

const ensureLogDir = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
};

const redact = (value) => {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const auditLog = (event, payload = {}) => {
  try {
    ensureLogDir();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload,
    });
    fs.appendFile(LOG_FILE, `${line}\n`, () => {});
  } catch (err) {
    console.error('Audit log failure:', err.message);
  }
};

const requestAuditMiddleware = (req, res, next) => {
  const startedAt = Date.now();
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';

  res.on('finish', () => {
    auditLog('http_request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latencyMs: Date.now() - startedAt,
      ip,
      ua: userAgent,
    });
  });

  next();
};

module.exports = {
  auditLog,
  redact,
  requestAuditMiddleware,
};
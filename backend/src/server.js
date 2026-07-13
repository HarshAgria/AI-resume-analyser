require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const analyzeRoute = require('./routes/analyze');
const { requestAuditMiddleware, auditLog } = require('./utils/auditLogger');
const { isAppError } = require('./utils/appError');

const app = express();
const PORT = process.env.PORT || 3000;

const getIp = (req) => req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.UPLOAD_RATE_LIMIT_MAX || 12),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getIp,
  handler: (req, res) => {
    return res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many upload attempts from this IP. Please wait and try again.',
        userMessage: 'You have made too many requests. Please wait a few minutes and try again.',
        retryable: true,
      },
    });
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 80),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getIp,
});

// Middleware
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT || '1mb' }));
app.use(requestAuditMiddleware);
app.use('/api', apiLimiter);

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Resume Analyzer API is running' });
});

app.use('/api/analyze', uploadLimiter, analyzeRoute);

// Global error handler
app.use((err, req, res, next) => {
  const status = isAppError(err) ? err.status : 500;
  const code = isAppError(err) ? err.code : 'INTERNAL_SERVER_ERROR';
  const userMessage = isAppError(err)
    ? err.userMessage
    : 'A server error occurred while processing your request. Please try again.';

  auditLog('request_error', {
    code,
    status,
    path: req.originalUrl,
    method: req.method,
    ip: getIp(req),
    detail: err.message,
  });

  if (status >= 500) {
    console.error(err.stack || err.message);
  }

  res.status(status).json({
    error: {
      code,
      message: err.message || userMessage,
      userMessage,
      retryable: Boolean(err.retryable),
      details: err.details,
    },
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
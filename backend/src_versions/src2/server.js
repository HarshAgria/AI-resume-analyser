require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const analyzeRoute = require("./routes/analyze");
const { requestAuditMiddleware, auditLog } = require("./utils/auditLogger");
const { isAppError } = require("./utils/appError");

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "1mb";

const UPLOAD_RATE_LIMIT_MAX = Number(process.env.UPLOAD_RATE_LIMIT_MAX || 12);

const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 80);

// --------------------------------------------------
// Proxy configuration
// --------------------------------------------------
//
// Important when deployed behind Railway / reverse
// proxies.
//
// This allows Express to correctly determine the
// original client IP from the proxy chain.
//
// Keep this BEFORE rate limiters are used.
// --------------------------------------------------

app.set("trust proxy", 1);

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const getIp = (req) => {
  return req.ip || "unknown";
};


// --------------------------------------------------
// Rate limiting
// --------------------------------------------------
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: UPLOAD_RATE_LIMIT_MAX,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: getIp,

  handler: (req, res) => {
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",

        message:
          "Too many upload attempts from this IP. Please wait and try again.",

        userMessage:
          "You have made too many requests. Please wait a few minutes and try again.",

        retryable: true,
      },
    });
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: API_RATE_LIMIT_MAX,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: getIp,

  handler: (req, res) => {
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",

        message:
          "Too many API requests from this IP. Please wait and try again.",

        userMessage:
          "Too many requests. Please wait a few minutes and try again.",

        retryable: true,
      },
    });
  },
});

// Middleware
app.disable("x-powered-by");

// --------------------------------------------------
// CORS
// --------------------------------------------------

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// --------------------------------------------------
// Security headers
// --------------------------------------------------
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
});

// --------------------------------------------------
// Request body parsing
// --------------------------------------------------
//
// IMPORTANT:
// multipart/form-data uploads are handled by Multer.
// express.json() does NOT process the PDF itself.
//
// REQUEST_BODY_LIMIT protects JSON/urlencoded bodies.
// --------------------------------------------------
app.use(
  express.json({
    limit: REQUEST_BODY_LIMIT,
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: REQUEST_BODY_LIMIT,
  }),
);

// --------------------------------------------------
// Audit middleware
// --------------------------------------------------
app.use(requestAuditMiddleware);

// --------------------------------------------------
// Global API rate limiter
// --------------------------------------------------
app.use("/api", apiLimiter);

// --------------------------------------------------
// Health check
// --------------------------------------------------
app.get("/api/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    message: "Resume Analyzer API is running",
  });
});

// --------------------------------------------------
// Resume analysis
// --------------------------------------------------
app.use("/api/analyze", uploadLimiter, analyzeRoute);

// --------------------------------------------------
// Handle malformed JSON / body too large
// --------------------------------------------------

app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: {
        code: "REQUEST_BODY_TOO_LARGE",

        message: "Request body is too large.",

        userMessage:
          "The request is too large. Please reduce the amount of data and try again.",

        retryable: false,
      },
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",

        message: "The request contains invalid JSON.",

        userMessage: "The request could not be processed. Please try again.",

        retryable: false,
      },
    });
  }

  next(err);
});

// --------------------------------------------------
// Global error handler
// --------------------------------------------------
app.use((err, req, res, next) => {
  const status = isAppError(err) ? err.status : 500;

  const code = isAppError(err) ? err.code : "INTERNAL_SERVER_ERROR";

  const userMessage = isAppError(err)
    ? err.userMessage
    : "A server error occurred while processing your request. Please try again.";

  auditLog("request_error", {
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

  return res.status(status).json({
    error: {
      code,
      message: err.message || userMessage,
      userMessage,
      retryable: Boolean(err.retryable),
      details: err.details,
    },
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

  console.log(`Request body limit: ${REQUEST_BODY_LIMIT}`);

  console.log(`Upload rate limit: ${UPLOAD_RATE_LIMIT_MAX}/15min`);

  console.log(`API rate limit: ${API_RATE_LIMIT_MAX}/15min`);
});

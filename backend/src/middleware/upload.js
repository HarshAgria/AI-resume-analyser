const multer = require('multer');
const { AppError } = require('../utils/appError');

// Store file in memory (not on disk) — we'll upload directly to Cloudinary
const storage = multer.memoryStorage();
const MAX_SIZE_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024);

const hasSuspitionName = (name = '') => {
  const lowered = name.toLowerCase();
  return lowered.includes('..') || lowered.includes('%00') || lowered.includes('.exe') || lowered.includes('.js');
};

const isPdfSignatureValid = (buffer) => {
  if (!buffer || buffer.length < 4) return false;
  const header = buffer.subarray(0, 4).toString('utf-8');
  return header === '%PDF';
};

const fileFilter = (req, file, cb) => {
  if (hasSuspitionName(file.originalname || '')) {
    cb(new AppError('SUSPICIOUS_UPLOAD', 'Upload blocked due to suspicious file name or extension.',400), false);
    return;
  }
  
  if (file.mimetype === 'application/pdf' || (file.originalname || '').toLowerCase().endsWith('.pdf')) {
    cb(null, true);
    return;
  }

  cb(new AppError('UNSUPPORTED_FILE_TYPE', 'Only PDF files are supported.',400), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES } // 5MB max
}).single('resume');

const uploadResume = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('FILE_TOO_LARGE', `File too large. Please upload a PDF under 5MB.`, 413));
        return;
      }
      next(err);
      return;
    }

    if(!req.file) {
      next();
      return;
    }

    if (!isPdfSignatureValid(req.file.buffer)) {
      next(new AppError('CORRUPTED_OR_INVALID_FILE', 'The uploaded file is not a valid PDF or is corrupted.', 400));
      return;
    }

    next();
  });
};

module.exports = uploadResume;
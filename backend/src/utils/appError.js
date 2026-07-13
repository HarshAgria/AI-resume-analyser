class AppError extends Error {
  constructor(code, userMessage, status = 500, details = undefined, retryable = false) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.status = status;
    this.details = details;
    this.retryable = retryable;
  }
}

const isAppError = (value) => value instanceof AppError;

module.exports = {
  AppError,
  isAppError,
};
function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  // Prefer an explicit status set by the thrower; otherwise fall back to a
  // heuristic for errors raised elsewhere (e.g. the pg driver).
  const fallbackStatus = /unsupported|not supported|required|unable|no replica/i.test(error.message) ? 400 : 500;
  const status = Number.isInteger(error.statusCode) ? error.statusCode : fallbackStatus;

  res.status(status).json({
    error: error.message || 'Unexpected error'
  });
}

module.exports = {
  errorHandler
};
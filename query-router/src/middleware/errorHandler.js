function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = /unsupported|required|unable|no replica/i.test(error.message) ? 400 : 500;

  res.status(status).json({
    error: error.message || 'Unexpected error'
  });
}

module.exports = {
  errorHandler
};
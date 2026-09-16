const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err.stack || err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : (err.message || 'Internal server error.'),
    }
  });
};

module.exports = errorHandler;

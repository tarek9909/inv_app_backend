const errorHandler = (error, req, res, next) => {
  const status = error.statusCode || error.status || 500;
  const message = status === 500 ? 'Internal server error' : error.message;

  if (status === 500 && process.env.NODE_ENV !== 'test') {
    console.error(error);
  }

  res.status(status).json({
    success: false,
    message,
    errors: error.errors || []
  });
};

module.exports = errorHandler;

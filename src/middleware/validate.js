const HttpError = require('../utils/httpError');

module.exports = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    return next(new HttpError(422, 'Validation failed', error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message
    }))));
  }

  req[source] = value;
  return next();
};

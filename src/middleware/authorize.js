const HttpError = require('../utils/httpError');
const { userHasPermission } = require('../services/permissionService');

module.exports = (...allowedRoles) => (req, res, next) => {
  const code = req.user && req.user.role && req.user.role.code;
  if (code === 'admin' || allowedRoles.includes(code)) return next();
  return next(new HttpError(403, 'You do not have permission to perform this action'));
};

module.exports.requirePermission = (permissionKey) => async (req, res, next) => {
  try {
    if (await userHasPermission(req.user, permissionKey)) return next();
    return next(new HttpError(403, 'You do not have permission to perform this action'));
  } catch (error) {
    return next(error);
  }
};

module.exports.requireAnyPermission = (permissionKeys) => async (req, res, next) => {
  try {
    for (const permissionKey of permissionKeys) {
      if (await userHasPermission(req.user, permissionKey)) return next();
    }
    return next(new HttpError(403, 'You do not have permission to perform this action'));
  } catch (error) {
    return next(error);
  }
};

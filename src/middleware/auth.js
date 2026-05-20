const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { attachPermissions } = require('../services/permissionService');
const { loadUserWithRole } = require('../services/userService');
const HttpError = require('../utils/httpError');

const CACHE_TTL_MS = 30 * 1000;
const userCache = new Map();
const inFlight = new Map();

const loadCachedUser = async (userId) => {
  const now = Date.now();
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.user;
  if (inFlight.has(userId)) return inFlight.get(userId);

  const promise = (async () => {
    const user = await loadUserWithRole(userId, { includeDriver: true });
    if (!user || user.status !== 'active') return null;
    const safeUser = (await attachPermissions(user)).toJSON();
    userCache.set(userId, { user: safeUser, expiresAt: Date.now() + CACHE_TTL_MS });
    return safeUser;
  })().finally(() => inFlight.delete(userId));

  inFlight.set(userId, promise);
  return promise;
};

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) throw new HttpError(401, 'Authentication token is required');

    const payload = jwt.verify(token, config.jwt.secret);
    const user = await loadCachedUser(payload.id);

    if (!user || user.status !== 'active') throw new HttpError(401, 'User is not allowed to access the system');

    req.user = user;
    const allowedWhileChanging = ['/auth/me', '/auth/me/password', '/auth/logout', '/me', '/me/password', '/logout'];
    if (req.user.must_change_password && !allowedWhileChanging.includes(req.path)) {
      throw new HttpError(403, 'Password change is required before continuing');
    }
    next();
  } catch (error) {
    next(error.statusCode ? error : new HttpError(401, 'Invalid or expired token'));
  }
};

module.exports = authenticate;

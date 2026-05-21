const crypto = require('crypto');

/**
 * In-memory token blacklist with automatic TTL-based cleanup.
 * Tokens are stored by their hash (not the raw token) for security.
 *
 * For multi-instance deployments, replace this with Redis or another
 * shared store. The interface is intentionally simple to allow easy swap.
 */

const blacklist = new Map(); // tokenHash -> expiresAt (ms)
const userRevokeTimestamps = new Map(); // userId -> revokedBefore (seconds, JWT iat granularity)

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const cleanup = () => {
  const now = Date.now();
  for (const [hash, expiresAt] of blacklist.entries()) {
    if (expiresAt <= now) blacklist.delete(hash);
  }
};

// Periodic cleanup
const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
if (cleanupTimer.unref) cleanupTimer.unref();

/**
 * Add a token to the blacklist until its expiry.
 * @param {string} token - the raw JWT
 * @param {number} expSeconds - JWT exp claim (seconds since epoch)
 */
const revokeToken = (token, expSeconds) => {
  if (!token) return;
  const expiresAt = Number(expSeconds) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
  blacklist.set(hashToken(token), expiresAt);
};

/**
 * Check whether a token has been revoked.
 */
const isTokenRevoked = (token) => {
  if (!token) return false;
  const hash = hashToken(token);
  const expiresAt = blacklist.get(hash);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    blacklist.delete(hash);
    return false;
  }
  return true;
};

/**
 * Revoke all tokens issued for a user before now.
 * Used when an admin disables a user, resets their password, etc.
 * @param {number|string} userId
 */
const revokeAllForUser = (userId) => {
  if (userId === null || userId === undefined) return;
  const now = Math.floor(Date.now() / 1000);
  userRevokeTimestamps.set(Number(userId), now);
};

/**
 * Check whether a user's token (with iat claim) was revoked.
 */
const isUserTokenRevoked = (userId, iatSeconds) => {
  if (userId === null || userId === undefined) return false;
  const revokedBefore = userRevokeTimestamps.get(Number(userId));
  if (!revokedBefore) return false;
  return Number(iatSeconds) < revokedBefore;
};

const stats = () => ({
  blacklistSize: blacklist.size,
  userRevokeCount: userRevokeTimestamps.size
});

module.exports = {
  revokeToken,
  isTokenRevoked,
  revokeAllForUser,
  isUserTokenRevoked,
  stats
};

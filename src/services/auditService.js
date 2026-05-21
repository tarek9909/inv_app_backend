const { AuditLog } = require('../models');

const SENSITIVE_KEYS = new Set([
  'password',
  'current_password',
  'new_password',
  'temporary_password',
  'confirm_password',
  'token',
  'token_hash',
  'access_token',
  'refresh_token'
]);

const sanitize = (value) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitize(val);
      }
    }
    return result;
  }
  return value;
};

const encodeSnapshot = (value) => {
  if (value === null || value === undefined) return null;
  const sanitized = sanitize(value);
  return typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
};

const logAction = async ({ req, action, module, recordId, oldData = null, newData = null, transaction = null }) => {
  await AuditLog.create({
    user_id: req.user ? req.user.id : null,
    action,
    module,
    record_id: recordId || null,
    old_data: encodeSnapshot(oldData),
    new_data: encodeSnapshot(newData),
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  }, { transaction });
};

module.exports = { logAction };

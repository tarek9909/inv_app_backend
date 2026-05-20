const { AuditLog } = require('../models');

const encodeSnapshot = (value) => {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
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

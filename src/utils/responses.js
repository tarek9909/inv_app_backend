const ok = (res, message, data = {}, meta = {}) => res.json({ success: true, message, data, meta });

const created = (res, message, data = {}) => res.status(201).json({ success: true, message, data, meta: {} });

module.exports = { ok, created };

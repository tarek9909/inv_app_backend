const { Setting } = require('../models');
const { logAction } = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const { settingsCache: reportSettingsCache, reportCache } = require('../utils/cache');
const { ok } = require('../utils/responses');

const SETTING_KEYS = {
  accepted_request_fulfillment_mode: ['print', 'driver_portal', 'both'],
  qz_tray_enabled: ['true', 'false'],
  qz_default_printer: null,
  commissions_enabled: ['true', 'false'],
  commission_period: ['monthly'],
  commission_source_status: ['completed']
};

let controllerSettingsCache = { expiresAt: 0, data: null };
const SETTINGS_CACHE_MS = 30 * 1000;

const loadSettings = async ({ force = false } = {}) => {
  if (!force && controllerSettingsCache.data && controllerSettingsCache.expiresAt > Date.now()) return controllerSettingsCache.data;
  const rows = await Setting.findAll({ order: [['setting_key', 'ASC']] });
  const settings = {};
  rows.forEach((row) => { settings[row.setting_key] = row.setting_value || ''; });
  controllerSettingsCache = { data: settings, expiresAt: Date.now() + SETTINGS_CACHE_MS };
  return settings;
};

exports.listSettings = asyncHandler(async (req, res) => {
  ok(res, 'Settings loaded', await loadSettings());
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const updates = {};
  Object.entries(req.body || {}).forEach(([key, value]) => {
    if (!Object.prototype.hasOwnProperty.call(SETTING_KEYS, key)) return;
    const stringValue = String(value ?? '');
    const allowed = SETTING_KEYS[key];
    if (allowed && !allowed.includes(stringValue)) return;
    updates[key] = stringValue;
  });

  const oldRows = await Setting.findAll();
  const oldData = Object.fromEntries(oldRows.map((row) => [row.setting_key, row.setting_value]));

  for (const [key, value] of Object.entries(updates)) {
    const valueType = ['qz_tray_enabled', 'commissions_enabled'].includes(key) ? 'boolean' : 'string';
    const existing = await Setting.findOne({ where: { setting_key: key } });
    if (existing) {
      await existing.update({ setting_value: value, value_type: valueType, updated_by: req.user.id, updated_at: new Date() });
    } else {
      await Setting.create({ setting_key: key, setting_value: value, value_type: valueType, updated_by: req.user.id, updated_at: new Date() });
    }
  }

  await logAction({ req, action: 'update', module: 'settings', newData: updates, oldData });
  reportSettingsCache.invalidate('commission_settings');
  reportCache.invalidatePrefix('monthly_data:');
  ok(res, 'Settings updated', await loadSettings({ force: true }));
});

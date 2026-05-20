const router = require('express').Router();
const authenticate = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const settingsController = require('../controllers/settingsController');

router.get('/', authenticate, requirePermission('settings.manage'), settingsController.listSettings);
router.patch('/', authenticate, requirePermission('settings.manage'), settingsController.updateSettings);

module.exports = router;

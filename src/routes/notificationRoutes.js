const router = require('express').Router();
const controller = require('../controllers/notificationController');
const authenticate = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.get('/', authenticate, requirePermission('notifications.view'), validate(schemas.notificationList, 'query'), controller.list);
router.patch('/read-all', authenticate, requirePermission('notifications.view'), controller.markAllRead);
router.patch('/:id/read', authenticate, requirePermission('notifications.view'), controller.markRead);

module.exports = router;

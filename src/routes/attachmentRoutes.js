const router = require('express').Router();
const controller = require('../controllers/attachmentController');
const authenticate = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.post('/', authenticate, requirePermission('attachments.manage'), validate(schemas.attachmentCreate), controller.upload);
router.get('/', authenticate, requirePermission('attachments.manage'), validate(schemas.attachmentList, 'query'), controller.list);
router.get('/:id/download', authenticate, requirePermission('attachments.manage'), controller.download);
router.delete('/:id', authenticate, requirePermission('attachments.manage'), controller.remove);

module.exports = router;

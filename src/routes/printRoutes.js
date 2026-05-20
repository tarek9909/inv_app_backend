const router = require('express').Router();
const authenticate = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const printController = require('../controllers/printController');

router.get('/qz/certificate', authenticate, requirePermission('stock_requests.print'), printController.qzCertificate);
router.post('/qz/sign', authenticate, requirePermission('stock_requests.print'), printController.qzSign);

module.exports = router;

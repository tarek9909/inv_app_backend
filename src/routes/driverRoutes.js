const router = require('express').Router();
const authenticate = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');
const driverController = require('../controllers/driverController');

router.get('/me', authenticate, requirePermission('driver_portal.view'), driverController.me);
router.get('/stock-requests', authenticate, requirePermission('driver_portal.view'), driverController.listStockRequests);
router.get('/stock-requests/:id', authenticate, requirePermission('driver_portal.view'), driverController.getStockRequest);
router.post('/stock-requests/:id/invoice-viewed', authenticate, requirePermission('driver_portal.view'), driverController.markInvoiceViewed);
router.post('/stock-requests/:id/receipt', authenticate, requirePermission('driver_portal.view'), validate(schemas.driverReceipt), driverController.submitReceipt);

module.exports = router;

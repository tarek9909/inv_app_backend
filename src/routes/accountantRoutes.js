const router = require('express').Router();
const controller = require('../controllers/accountantController');
const authenticate = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.get('/drivers', authenticate, requirePermission('drivers.view'), validate(schemas.pagination, 'query'), controller.listDrivers);
router.post('/drivers', authenticate, requirePermission('drivers.create'), validate(schemas.driverCreate), controller.createDriver);
router.patch('/drivers/:id', authenticate, requirePermission('drivers.update'), validate(schemas.driverUpdate), controller.updateDriver);
router.patch('/drivers/:id/status', authenticate, requirePermission('drivers.archive'), validate(schemas.driverStatus), controller.updateDriverStatus);
router.delete('/drivers/:id', authenticate, requirePermission('drivers.delete'), controller.deleteDriver);
router.get('/drivers/:id/balance', authenticate, requirePermission('drivers.view_balance'), controller.driverBalance);
router.get('/drivers/:id/statement', authenticate, requirePermission('drivers.view_balance'), validate(schemas.reportQuery, 'query'), controller.driverStatement);
router.get('/drivers/:id/location-history', authenticate, requirePermission('drivers.view'), controller.driverLocationHistory);

router.get('/locations', authenticate, requirePermission('locations.view'), validate(schemas.pagination, 'query'), controller.listLocations);
router.post('/locations', authenticate, requirePermission('locations.manage'), validate(schemas.locationCreate), controller.createLocation);
router.patch('/locations/:id', authenticate, requirePermission('locations.manage'), validate(schemas.locationUpdate), controller.updateLocation);
router.patch('/locations/:id/status', authenticate, requirePermission('locations.manage'), validate(schemas.locationStatus), controller.updateLocationStatus);

router.get('/commission-rules', authenticate, requirePermission('commissions.manage'), validate(schemas.pagination, 'query'), controller.listCommissionRules);
router.post('/commission-rules', authenticate, requirePermission('commissions.manage'), validate(schemas.commissionRuleCreate), controller.createCommissionRule);
router.patch('/commission-rules/:id', authenticate, requirePermission('commissions.manage'), validate(schemas.commissionRuleUpdate), controller.updateCommissionRule);
router.patch('/commission-rules/:id/status', authenticate, requirePermission('commissions.manage'), validate(schemas.commissionRuleStatus), controller.updateCommissionRuleStatus);

router.get('/monthly-targets', authenticate, requirePermission('targets.manage'), validate(schemas.pagination, 'query'), controller.listMonthlyTargets);
router.post('/monthly-targets', authenticate, requirePermission('targets.manage'), validate(schemas.monthlyTargetCreate), controller.createMonthlyTarget);
router.patch('/monthly-targets/:id', authenticate, requirePermission('targets.manage'), validate(schemas.monthlyTargetUpdate), controller.updateMonthlyTarget);
router.patch('/monthly-targets/:id/status', authenticate, requirePermission('targets.manage'), validate(schemas.monthlyTargetStatus), controller.updateMonthlyTargetStatus);

router.get('/stock-requests', authenticate, requirePermission('stock_requests.view'), validate(schemas.stockRequestListQuery, 'query'), controller.listStockRequests);
router.post('/stock-requests', authenticate, requirePermission('stock_requests.create'), validate(schemas.stockRequestCreate), controller.createStockRequest);
router.get('/stock-requests/:id', authenticate, requirePermission('stock_requests.view'), controller.getStockRequest);
router.patch('/stock-requests/:id', authenticate, requirePermission('stock_requests.update'), validate(schemas.stockRequestUpdate), controller.updateStockRequest);
router.post('/stock-requests/:id/accept', authenticate, requirePermission('stock_requests.accept'), controller.acceptStockRequest);
router.post('/stock-requests/:id/complete', authenticate, requirePermission('stock_requests.complete'), validate(schemas.stockRequestComplete), controller.completeStockRequest);
router.post('/stock-requests/:id/reconcile', authenticate, requirePermission('stock_requests.update'), validate(schemas.stockRequestReconcile), controller.reconcileStockRequest);
router.post('/stock-requests/:id/cancel', authenticate, requirePermission('stock_requests.cancel'), controller.cancelStockRequest);
router.post('/stock-requests/:id/print', authenticate, requirePermission('stock_requests.print'), controller.printStockRequest);

router.get('/payments', authenticate, requirePermission('payments.view'), validate(schemas.pagination, 'query'), controller.listPayments);
router.post('/payments', authenticate, requirePermission('payments.create'), validate(schemas.paymentCreate), controller.createPayment);

module.exports = router;

const router = require('express').Router();
const controller = require('../controllers/reportController');
const authenticate = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.get('/dashboard', authenticate, requirePermission('dashboard.view'), controller.dashboard);
router.get('/inventory-summary', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.inventorySummary);
router.get('/driver-balances', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.driverBalances);
router.get('/payment-summary', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.paymentSummary);
router.get('/missing-payments', authenticate, requirePermission('reports.view'), validate(schemas.reportMonthQuery, 'query'), controller.missingPayments);
router.get('/purchase-summary', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.purchaseSummary);
router.get('/stock-movements', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.stockMovementReport);
router.get('/commission-summary', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.commissionSummary);
router.get('/target-kpis', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.targetKpis);
router.get('/driver-payroll', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.driverPayroll);
router.get('/driver-statements', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.driverStatements);
router.get('/driver-aging', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.driverAging);
router.get('/drivers/detail', authenticate, requirePermission('reports.view'), validate(schemas.driverReportQuery, 'query'), controller.driverDetailReports);
router.get('/drivers/:id/statement', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.driverStatement);
router.get('/drivers/:id/detail', authenticate, requirePermission('reports.view'), validate(schemas.reportQuery, 'query'), controller.driverDetailReport);

module.exports = router;

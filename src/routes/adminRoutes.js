const router = require('express').Router();
const adminController = require('../controllers/adminController');
const authenticate = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.get('/users', authenticate, requireAnyPermission(['team.view', 'drivers.create', 'drivers.update', 'stock_requests.create']), validate(schemas.userListQuery, 'query'), adminController.listUsers);
router.post('/users', authenticate, requirePermission('users.manage'), validate(schemas.userCreate), adminController.createUser);
router.patch('/users/:id', authenticate, requirePermission('users.manage'), validate(schemas.userUpdate), adminController.updateUser);
router.patch('/users/:id/status', authenticate, requirePermission('users.manage'), validate(schemas.userStatus), adminController.updateUserStatus);
router.post('/users/:id/reset-password', authenticate, requirePermission('users.reset_password'), validate(schemas.adminPasswordReset), adminController.resetUserPassword);
router.get('/roles', authenticate, requirePermission('team.view'), adminController.listRoles);
router.post('/roles', authenticate, requirePermission('roles.manage'), validate(schemas.roleCreate), adminController.createRole);
router.patch('/roles/:id', authenticate, requirePermission('roles.manage'), validate(schemas.roleUpdate), adminController.updateRole);
router.get('/permissions', authenticate, requirePermission('roles.manage'), adminController.listPermissions);
router.get('/roles/:id/permissions', authenticate, requirePermission('roles.manage'), adminController.getRolePermissions);
router.patch('/roles/:id/permissions', authenticate, requirePermission('roles.manage'), validate(schemas.rolePermissionsUpdate), adminController.updateRolePermissions);
router.get('/audit-logs', authenticate, requirePermission('audit_logs.view'), validate(schemas.pagination, 'query'), adminController.listAuditLogs);
router.get('/login-events', authenticate, requirePermission('audit_logs.view'), validate(schemas.pagination, 'query'), adminController.listLoginEvents);

module.exports = router;

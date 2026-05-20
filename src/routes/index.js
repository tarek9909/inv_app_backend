const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/', require('./adminRoutes'));
router.use('/', require('./inventoryRoutes'));
router.use('/', require('./accountantRoutes'));
router.use('/reports', require('./reportRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/attachments', require('./attachmentRoutes'));
router.use('/settings', require('./settingsRoutes'));
router.use('/print', require('./printRoutes'));
router.use('/driver', require('./driverRoutes'));

module.exports = router;

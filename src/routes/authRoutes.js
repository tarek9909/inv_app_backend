const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { success: false, message: 'Too many login attempts. Please try again in a minute.', errors: [] } });

router.post('/login', loginLimiter, validate(schemas.login), authController.login);
router.get('/me', authenticate, authController.me);
router.patch('/me/profile', authenticate, validate(schemas.profileUpdate), authController.updateProfile);
router.patch('/me/password', authenticate, validate(schemas.passwordChange), authController.changePassword);
router.post('/logout', authenticate, authController.logout);

module.exports = router;

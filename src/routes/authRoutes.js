const router = require('express').Router();
const authController = require('../controllers/authController');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.post('/login', validate(schemas.login), authController.login);
router.get('/me', authenticate, authController.me);
router.patch('/me/profile', authenticate, validate(schemas.profileUpdate), authController.updateProfile);
router.patch('/me/password', authenticate, validate(schemas.passwordChange), authController.changePassword);
router.post('/logout', authenticate, authController.logout);

module.exports = router;

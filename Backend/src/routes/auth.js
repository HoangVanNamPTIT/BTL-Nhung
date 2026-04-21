const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const AuthController = require('../controllers/AuthController');

// Public routes
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);

// Protected routes
router.post('/refresh', authenticate, AuthController.refreshToken);
router.get('/profile', authenticate, AuthController.getProfile);

module.exports = router;

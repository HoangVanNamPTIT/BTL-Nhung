const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ActivityController = require('../controllers/ActivityController');

// All activity routes require authentication
router.use(authenticate);

// Activity operations
router.get('/user/:userId', ActivityController.getUserActivity);
router.get('/device/:deviceId', ActivityController.getDeviceActivity);
router.get('/', ActivityController.getAllActivity);

module.exports = router;

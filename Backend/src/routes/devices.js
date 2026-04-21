const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const DeviceController = require('../controllers/DeviceController');

// All device routes require authentication
router.use(authenticate);

// Device operations
router.get('/', DeviceController.listDevices);
router.get('/:id', DeviceController.getDevice);
router.post('/claim', DeviceController.claimDevice);
router.post('/:id/release', DeviceController.releaseDevice);
router.put('/:id/settings', DeviceController.updateSettings);
router.get('/:id/telemetry', DeviceController.getTelemetry);

module.exports = router;

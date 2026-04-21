const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const TelemetryController = require('../controllers/TelemetryController');

// All telemetry routes require authentication
router.use(authenticate);

// Telemetry operations
router.get('/room/:roomId', TelemetryController.getLatestData);
router.get('/room/:roomId/history', TelemetryController.getHistoricalData);

module.exports = router;

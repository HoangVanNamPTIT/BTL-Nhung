const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const RoomController = require('../controllers/RoomController');

// All room routes require authentication
router.use(authenticate);

// Room operations
router.get('/:roomId', RoomController.getRoom);
router.put('/:roomId/mode', RoomController.updateMode);
router.put('/:roomId/fan', RoomController.updateFan);
router.get('/:roomId/telemetry', RoomController.getTelemetry);

module.exports = router;

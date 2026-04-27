const express = require("express");
const router = express.Router();
const {
  testEmitFirmwareStatus,
  testListDevices,
  testSocketStatus,
  testCompleteOtaFlow,
} = require("../controllers/testController");

/**
 * Test Routes - For debugging OTA functionality
 * 
 * ⚠️  WARNING: These routes should only be used in development!
 * Remove or protect with authentication in production.
 */

/**
 * GET /api/test/socket-status
 * Check if Socket.io is running and clients connected
 */
router.get("/socket-status", testSocketStatus);

/**
 * GET /api/test/devices
 * List all devices available for testing
 */
router.get("/devices", testListDevices);

/**
 * GET /api/test/emit-firmware-status
 * Emit a fake firmware update status event
 * 
 * Query params:
 *   - deviceId (required): Device ID
 *   - status (required): "success" or "failed"
 *   - version (required): Firmware version (e.g., "1.0.1")
 *   - error (optional): Error message if status="failed"
 * 
 * Example: GET /api/test/emit-firmware-status?deviceId=1&status=success&version=1.0.1
 */
router.get("/emit-firmware-status", testEmitFirmwareStatus);

/**
 * POST /api/test/complete-ota-test
 * Trigger a complete OTA test flow with delayed success event
 * 
 * Body:
 *   {
 *     "deviceId": 1,
 *     "firmwareVersion": "1.0.1",
 *     "delayMs": 5000
 *   }
 */
router.post("/complete-ota-test", testCompleteOtaFlow);

module.exports = router;

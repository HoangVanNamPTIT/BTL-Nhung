/**
 * Test controller for OTA functionality
 * Provides test endpoints to verify Socket.io communication
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Test endpoint: Emit fake firmware_update_status event
 * Simulates device sending OTA confirmation
 * 
 * Usage: GET /api/test/emit-firmware-status?deviceId=1&status=success&version=1.0.1
 */
exports.testEmitFirmwareStatus = async (req, res) => {
  try {
    const { deviceId, status, version, macAddress, error } = req.query;

    if (!deviceId || !status || !version) {
      return res.status(400).json({
        message: "Cần thiết: deviceId, status, version",
        example: "/api/test/emit-firmware-status?deviceId=1&status=success&version=1.0.1",
      });
    }

    // Get device info
    const device = await prisma.device.findUnique({
      where: { id: deviceId }, // deviceId is string (UUID)
      select: { id: true, device_name: true, mac_address: true },
    });

    if (!device) {
      return res.status(404).json({ message: `Device not found: ${deviceId}` });
    }

    // Get io instance from app
    const io = req.app.get("io");
    if (!io) {
      return res.status(500).json({ message: "Socket.io not available" });
    }

    // Emit fake firmware_update_status event
    const eventData = {
      deviceId: device.id,
      deviceName: device.device_name,
      macAddress: device.mac_address,
      status,
      version,
      error: error || null,
      completedAt: new Date(),
    };

    console.log(
      `\n[TEST] 🧪 Emitting fake firmware_update_status event:`,
      eventData
    );
    io.emit("firmware_update_status", eventData);

    res.json({
      message: "✅ Test event emitted successfully",
      event: "firmware_update_status",
      data: eventData,
      instruction:
        "Check frontend console - you should see form update from 50% → 100%",
    });
  } catch (error) {
    console.error("[TEST] Error:", error);
    res.status(500).json({
      message: "Error emitting test event",
      error: error.message,
    });
  }
};

/**
 * Test endpoint: List all devices for testing
 * 
 * Usage: GET /api/test/devices
 */
exports.testListDevices = async (req, res) => {
  try {
    const devices = await prisma.device.findMany({
      select: {
        id: true,
        device_name: true,
        mac_address: true,
        status: true,
      },
    });

    res.json({
      message: "✅ Available devices",
      devices,
      testExample: `/api/test/emit-firmware-status?deviceId=${devices[0]?.id || 1}&status=success&version=1.0.1`,
    });
  } catch (error) {
    console.error("[TEST] Error:", error);
    res.status(500).json({
      message: "Error listing devices",
      error: error.message,
    });
  }
};

/**
 * Test endpoint: Get Socket.io connection status
 * 
 * Usage: GET /api/test/socket-status
 */
exports.testSocketStatus = async (req, res) => {
  try {
    const io = req.app.get("io");

    if (!io) {
      return res.status(500).json({
        status: "❌ Socket.io not initialized",
      });
    }

    const connectedClients = Object.keys(io.sockets.sockets).length;

    res.json({
      status: "✅ Socket.io is running",
      connectedClients,
      namespace: io.of("/").name,
      message:
        connectedClients > 0
          ? "✅ Frontend clients connected"
          : "⚠️ No connected clients yet",
    });
  } catch (error) {
    res.status(500).json({
      status: "❌ Error checking Socket.io",
      error: error.message,
    });
  }
};

/**
 * Test endpoint: Trigger complete OTA test flow
 * 
 * Usage: POST /api/test/complete-ota-test
 * Body: {
 *   "deviceId": 1,
 *   "firmwareVersion": "1.0.1",
 *   "delayMs": 5000
 * }
 */
exports.testCompleteOtaFlow = async (req, res) => {
  try {
    const { deviceId, firmwareVersion = "1.0.1", delayMs = 5000 } = req.body;

    if (!deviceId) {
      return res
        .status(400)
        .json({ message: "deviceId is required" });
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId }, // deviceId is string (UUID)
      select: { id: true, device_name: true, mac_address: true },
    });

    if (!device) {
      return res.status(404).json({ message: `Device not found: ${deviceId}` });
    }

    const io = req.app.get("io");
    if (!io) {
      return res.status(500).json({ message: "Socket.io not available" });
    }

    // Emit initial trigger event
    console.log(`\n[TEST] 🧪 Triggering complete OTA test flow:`);
    console.log(`[TEST] Device: ${device.device_name} (${device.mac_address})`);
    console.log(`[TEST] Firmware: ${firmwareVersion}`);
    console.log(`[TEST] Will emit success event after ${delayMs}ms`);

    // Schedule success event emission
    setTimeout(() => {
      const eventData = {
        deviceId: device.id,
        deviceName: device.device_name,
        macAddress: device.mac_address,
        status: "success",
        version: firmwareVersion,
        completedAt: new Date(),
      };

      console.log(`[TEST] ✅ Emitting firmware_update_status:`, eventData);
      io.emit("firmware_update_status", eventData);
    }, delayMs);

    res.json({
      message: "✅ OTA test flow started",
      device: {
        id: device.id,
        name: device.device_name,
        mac: device.mac_address,
      },
      expectedBehavior: [
        `1. Form shows Progress = 50% immediately`,
        `2. Wait ${delayMs}ms...`,
        `3. Form updates to Progress = 100% (or ✅ Thành công)`,
      ],
      instruction:
        "Keep the form open and watch for updates in the progress modal",
    });
  } catch (error) {
    console.error("[TEST] Error:", error);
    res.status(500).json({
      message: "Error in test flow",
      error: error.message,
    });
  }
};

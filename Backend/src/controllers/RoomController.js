const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

class RoomController {
  /**
   * Get room details
   */
  static async getRoom(req, res) {
    try {
      const { roomId } = req.params;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          device: {
            select: {
              id: true,
            },
          },
          telemetry_data: {
            orderBy: { timestamp: "desc" },
            take: 20,
          },
        },
      });

      if (!room) {
        return res.status(404).json({
          error: "Room not found",
        });
      }

      // Verify user has access to device
      const userDevice = await prisma.userDevice.findFirst({
        where: {
          device_id: room.device.id,
          user_id: req.user.id,
        },
      });

      if (!userDevice) {
        return res.status(403).json({
          error: "Unauthorized",
        });
      }

      res.json({
        room,
      });
    } catch (error) {
      console.error("Get room error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Update room mode (AUTO/MANUAL)
   */
  static async updateMode(req, res) {
    try {
      const { roomId } = req.params;
      const { mode } = req.body;

      if (!["AUTO", "MANUAL"].includes(mode)) {
        return res.status(400).json({
          error: "Invalid mode. Must be AUTO or MANUAL",
        });
      }

      // Get room with device info
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          device: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!room) {
        return res.status(404).json({
          error: "Room not found",
        });
      }

      // Verify user has access to device
      const userDevice = await prisma.userDevice.findFirst({
        where: {
          device_id: room.device.id,
          user_id: req.user.id,
        },
      });

      if (!userDevice) {
        return res.status(403).json({
          error: "Unauthorized",
        });
      }

      // Update room mode
      const updated = await prisma.room.update({
        where: { id: roomId },
        data: { current_mode: mode },
      });

      // Send command to device
      const { mqttPool } = require("../index");
      if (mqttPool) {
        await mqttPool.sendCommand(
          room.device.id,
          room.room_index,
          mode,
          room.current_fan_status,
        );
      }

      // Log activity
      await prisma.activityLog.create({
        data: {
          user_id: req.user.id,
          device_id: room.device.id,
          event_type: "MODE_CHANGED",
          description: `Changed ${room.room_name} mode to ${mode}`,
        },
      });

      const { io } = require("../index");
      if (io) {
        io.emit("activity_log", {
          deviceId: room.device.id,
          eventType: "MODE_CHANGED",
          description: `Changed ${room.room_name} mode to ${mode}`,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        message: "Mode updated successfully",
        room: updated,
      });
    } catch (error) {
      console.error("Update mode error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Update fan status (ON/OFF)
   */
  static async updateFan(req, res) {
    try {
      const { roomId } = req.params;
      const { fan } = req.body;

      if (typeof fan !== "boolean") {
        return res.status(400).json({
          error: "Invalid fan value. Must be boolean",
        });
      }

      // Get room with device info
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          device: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!room) {
        return res.status(404).json({
          error: "Room not found",
        });
      }

      // Verify user has access to device
      const userDevice = await prisma.userDevice.findFirst({
        where: {
          device_id: room.device.id,
          user_id: req.user.id,
        },
      });

      if (!userDevice) {
        return res.status(403).json({
          error: "Unauthorized",
        });
      }

      // Check if mode is MANUAL
      if (room.current_mode !== "MANUAL") {
        return res.status(400).json({
          error: "Cannot control fan in AUTO mode",
        });
      }

      // Update room fan status
      const updated = await prisma.room.update({
        where: { id: roomId },
        data: { current_fan_status: fan },
      });

      // Send command to device
      const { mqttPool } = require("../index");
      if (mqttPool) {
        await mqttPool.sendCommand(
          room.device.id,
          room.room_index,
          room.current_mode,
          fan,
        );
      }

      // Log activity
      await prisma.activityLog.create({
        data: {
          user_id: req.user.id,
          device_id: room.device.id,
          event_type: "FAN_TOGGLED",
          description: `Turned fan ${fan ? "ON" : "OFF"} in ${room.room_name}`,
        },
      });

      const { io } = require("../index");
      if (io) {
        io.emit("activity_log", {
          deviceId: room.device.id,
          eventType: "FAN_TOGGLED",
          description: `Turned fan ${fan ? "ON" : "OFF"} in ${room.room_name}`,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        message: "Fan updated successfully",
        room: updated,
      });
    } catch (error) {
      console.error("Update fan error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Get telemetry data for a room
   */
  static async getTelemetry(req, res) {
    try {
      const { roomId } = req.params;
      const { hours = 24, limit = 100 } = req.query;

      // Get room with device info
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          device: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!room) {
        return res.status(404).json({
          error: "Room not found",
        });
      }

      // Verify user has access to device
      const userDevice = await prisma.userDevice.findFirst({
        where: {
          device_id: room.device.id,
          user_id: req.user.id,
        },
      });

      if (!userDevice) {
        return res.status(403).json({
          error: "Unauthorized",
        });
      }

      // Get telemetry data
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const data = await prisma.telemetryData.findMany({
        where: {
          room_id: roomId,
          timestamp: {
            gte: since,
          },
        },
        orderBy: { timestamp: "desc" },
        take: parseInt(limit),
      });

      res.json({
        room_id: roomId,
        room_name: room.room_name,
        telemetry: data.reverse(),
      });
    } catch (error) {
      console.error("Get telemetry error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }
}

module.exports = RoomController;

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

class DeviceController {
  /**
   * Verify that a device can be claimed with MAC and PIN
   */
  static async verifyClaim(req, res) {
    try {
      const { mac_address, claim_pin } = req.body;

      if (!mac_address || !claim_pin) {
        return res.status(400).json({
          error: "MAC address and claim PIN are required",
        });
      }

      const device = await prisma.device.findFirst({
        where: {
          mac_address,
          claim_pin,
          owner_id: null,
        },
        select: {
          id: true,
          mac_address: true,
          device_name: true,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found or already claimed",
        });
      }

      res.json({
        message: "Device verified successfully",
        device,
      });
    } catch (error) {
      console.error("Verify claim error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * List all devices owned by the user
   */
  static async listDevices(req, res) {
    try {
      const devices = await prisma.device.findMany({
        where: {
          owner_id: req.user.id,
        },
        include: {
          rooms: {
            include: {
              telemetry_data: {
                orderBy: { timestamp: "desc" },
                take: 20,
              },
            },
          },
          mqtt_config: {
            select: {
              id: true,
              broker_url: true,
              port: true,
            },
          },
        },
      });

      res.json({
        devices: devices,
      });
    } catch (error) {
      console.error("List devices error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Get single device by ID
   */
  static async getDevice(req, res) {
    try {
      const { id } = req.params;

      const device = await prisma.device.findFirst({
        where: {
          id,
          owner_id: req.user.id,
        },
        include: {
          rooms: {
            include: {
              telemetry_data: {
                orderBy: { timestamp: "desc" },
                take: 20,
              },
            },
          },
          mqtt_config: {
            select: {
              id: true,
              broker_url: true,
              port: true,
            },
          },
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found",
        });
      }

      res.json({
        device: device,
      });
    } catch (error) {
      console.error("Get device error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Claim a device by MAC address and PIN
   */
  static async claimDevice(req, res) {
    try {
      const { mac_address, claim_pin, device_name, mqtt_config, rooms } =
        req.body;

      // Validate input
      if (!mac_address || !claim_pin) {
        return res.status(400).json({
          error: "MAC address and claim PIN are required",
        });
      }

      // Find unclaimed device
      const device = await prisma.device.findFirst({
        where: {
          mac_address,
          claim_pin,
          owner_id: null,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found or already claimed",
        });
      }

      // Start transaction
      const claimedDevice = await prisma.$transaction(async (tx) => {
        // Update device ownership
        const updated = await tx.device.update({
          where: { id: device.id },
          data: {
            owner_id: req.user.id,
            device_name: device_name || `ESP-Device`,
          },
        });

        // Save MQTT config if provided
        if (mqtt_config) {
          await tx.mqttConfig.create({
            data: {
              device_id: device.id,
              broker_url: mqtt_config.broker_url,
              port: mqtt_config.port,
              username: mqtt_config.username,
              password: mqtt_config.password,
            },
          });
        }

        // Create rooms if provided
        if (rooms && Array.isArray(rooms)) {
          for (let i = 0; i < rooms.length; i++) {
            await tx.room.create({
              data: {
                device_id: device.id,
                room_index: i + 1,
                room_name: rooms[i].room_name || `Room ${i + 1}`,
              },
            });
          }
        }

        // Log activity
        await tx.activityLog.create({
          data: {
            user_id: req.user.id,
            device_id: device.id,
            event_type: "DEVICE_CLAIMED",
            description: `User claimed device ${device.device_name}`,
          },
        });

        return updated;
      });

      // Fetch complete device data
      const fullDevice = await prisma.device.findUnique({
        where: { id: claimedDevice.id },
        include: {
          rooms: true,
          mqtt_config: {
            select: {
              id: true,
              broker_url: true,
              port: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Device claimed successfully",
        device: fullDevice,
      });

      // Try to connect MQTT client immediately after successful claim.
      const { mqttPool } = require("../index");
      if (mqttPool && fullDevice.mqtt_config) {
        await mqttPool.connectDevice(fullDevice);
      }
    } catch (error) {
      console.error("Claim device error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Release a device
   */
  static async releaseDevice(req, res) {
    try {
      const { id } = req.params;

      // Get device
      const device = await prisma.device.findFirst({
        where: {
          id,
          owner_id: req.user.id,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found",
        });
      }

      // Release device in transaction
      await prisma.$transaction(async (tx) => {
        // Update device
        await tx.device.update({
          where: { id: device.id },
          data: {
            owner_id: null,
            status: "OFFLINE",
          },
        });

        // Log activity
        await tx.activityLog.create({
          data: {
            user_id: req.user.id,
            device_id: device.id,
            event_type: "DEVICE_RELEASED",
            description: "User released device",
          },
        });
      });

      // Notify backend to disconnect MQTT client (via app context)
      const { mqttPool } = require("../index");
      if (mqttPool) {
        await mqttPool.disconnectDevice(id);
      }

      res.json({
        message: "Device released successfully",
      });
    } catch (error) {
      console.error("Release device error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Disconnect device (keeps ownership but closes MQTT connection)
   */
  static async disconnectDevice(req, res) {
    try {
      const { id } = req.params;

      // Get device
      const device = await prisma.device.findFirst({
        where: {
          id,
          owner_id: req.user.id,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found",
        });
      }

      // Mark device as offline
      await prisma.device.update({
        where: { id: device.id },
        data: { status: "OFFLINE" },
      });

      console.log(
        `[API] Device ${device.device_name} (${id}) manually disconnected by user`,
      );

      // Disconnect MQTT client
      const { mqttPool } = require("../index");
      if (mqttPool) {
        await mqttPool.disconnectDevice(id);
      }

      res.json({
        message: "Device disconnected successfully",
      });
    } catch (error) {
      console.error("Disconnect device error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Reconnect device (resume MQTT connection after manual disconnect)
   */
  static async reconnectDevice(req, res) {
    try {
      const { id } = req.params;

      // Get device with MQTT config
      const device = await prisma.device.findFirst({
        where: {
          id,
          owner_id: req.user.id,
        },
        include: {
          mqtt_config: true,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found",
        });
      }

      if (!device.mqtt_config) {
        return res.status(400).json({
          error: "Device MQTT config not found",
        });
      }

      // Mark device as online
      await prisma.device.update({
        where: { id: device.id },
        data: { status: "ONLINE", last_connected: new Date() },
      });

      console.log(
        `[API] Device ${device.device_name} (${id}) reconnecting...`,
      );

      // Reconnect MQTT client
      const { mqttPool } = require("../index");
      if (mqttPool) {
        await mqttPool.connectDevice(device);
      }

      res.json({
        message: "Device reconnected successfully",
      });
    } catch (error) {
      console.error("Reconnect device error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Delete device permanently (removes device and all related data)
   */
  static async deleteDevice(req, res) {
    try {
      const { id } = req.params;

      // Get device
      const device = await prisma.device.findFirst({
        where: {
          id,
          owner_id: req.user.id,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found",
        });
      }

      // Delete device and all related data in transaction
      await prisma.$transaction(async (tx) => {
        // Delete all telemetry data for device's rooms
        const rooms = await tx.room.findMany({
          where: { device_id: id },
          select: { id: true },
        });

        for (const room of rooms) {
          await tx.telemetryData.deleteMany({
            where: { room_id: room.id },
          });
        }

        // Delete all rooms
        await tx.room.deleteMany({
          where: { device_id: id },
        });

        // Delete MQTT config
        await tx.mqttConfig.deleteMany({
          where: { device_id: id },
        });

        // Delete activity logs
        await tx.activityLog.deleteMany({
          where: { device_id: id },
        });

        // Delete device
        await tx.device.delete({
          where: { id },
        });

        // Log activity (for user's account)
        await tx.activityLog.create({
          data: {
            user_id: req.user.id,
            device_id: null,
            event_type: "DEVICE_DELETED",
            description: `User deleted device "${device.device_name}"`,
          },
        });
      });

      console.log(
        `[API] Device ${device.device_name} (${id}) deleted by user ${req.user.id}`,
      );

      // Disconnect MQTT client
      const { mqttPool } = require("../index");
      if (mqttPool) {
        await mqttPool.disconnectDevice(id);
      }

      res.json({
        message: "Device deleted successfully",
      });
    } catch (error) {
      console.error("Delete device error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Update device settings (name, room names, MQTT config)
   */
  static async updateSettings(req, res) {
    try {
      const { id } = req.params;
      const { device_name, rooms, mqtt_config } = req.body;

      // Verify ownership
      const device = await prisma.device.findFirst({
        where: {
          id,
          owner_id: req.user.id,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found or not owned by user",
        });
      }

      // Update in transaction
      const updated = await prisma.$transaction(async (tx) => {
        // Update device name if provided
        if (device_name) {
          await tx.device.update({
            where: { id },
            data: { device_name },
          });
        }

        // Update room names if provided
        if (rooms && Array.isArray(rooms)) {
          for (const room of rooms) {
            await tx.room.update({
              where: { id: room.id },
              data: { room_name: room.room_name },
            });
          }
        }

        // Update MQTT config if provided
        if (mqtt_config) {
          await tx.mqttConfig.update({
            where: { device_id: id },
            data: {
              broker_url: mqtt_config.broker_url,
              port: mqtt_config.port,
              username: mqtt_config.username,
              password: mqtt_config.password,
            },
          });
        }

        // Log activity
        await tx.activityLog.create({
          data: {
            user_id: req.user.id,
            device_id: id,
            event_type: "SETTINGS_UPDATED",
            description: "User updated device settings",
          },
        });

        return tx.device.findUnique({
          where: { id },
          include: {
            rooms: true,
            mqtt_config: {
              select: {
                id: true,
                broker_url: true,
                port: true,
              },
            },
          },
        });
      });

      res.json({
        message: "Settings updated successfully",
        device: updated,
      });
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Get telemetry data for a device
   */
  static async getTelemetry(req, res) {
    try {
      const { id } = req.params;
      const { hours = 24, limit = 100 } = req.query;

      // Verify ownership
      const device = await prisma.device.findFirst({
        where: {
          id,
          owner_id: req.user.id,
        },
        include: {
          rooms: true,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found",
        });
      }

      // Get telemetry data
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const telemetryByRoom = {};

      for (const room of device.rooms) {
        const data = await prisma.telemetryData.findMany({
          where: {
            room_id: room.id,
            timestamp: {
              gte: since,
            },
          },
          orderBy: { timestamp: "desc" },
          take: parseInt(limit),
        });

        telemetryByRoom[room.id] = {
          room_name: room.room_name,
          data: data.reverse(),
        };
      }

      res.json({
        device_id: device.id,
        device_name: device.device_name,
        telemetry: telemetryByRoom,
      });
    } catch (error) {
      console.error("Get telemetry error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Send control command with payload: { deviceId, room, mode, fan }
   */
  static async sendControl(req, res) {
    try {
      const { deviceId, room, mode, fan } = req.body;

      if (!deviceId || !room || !mode || typeof fan !== "boolean") {
        return res.status(400).json({
          error: "deviceId, room, mode and fan are required",
        });
      }

      if (!["AUTO", "MANUAL"].includes(mode)) {
        return res.status(400).json({
          error: "Invalid mode. Must be AUTO or MANUAL",
        });
      }

      const device = await prisma.device.findFirst({
        where: {
          id: deviceId,
          owner_id: req.user.id,
        },
      });

      if (!device) {
        return res.status(404).json({
          error: "Device not found",
        });
      }

      const roomIndex = parseInt(room, 10);
      const roomEntity = await prisma.room.findFirst({
        where: {
          device_id: deviceId,
          room_index: roomIndex,
        },
      });

      if (!roomEntity) {
        return res.status(404).json({
          error: "Room not found",
        });
      }

      if (mode === "AUTO" && fan !== roomEntity.current_fan_status) {
        return res.status(400).json({
          error: "Cannot toggle fan while mode is AUTO",
        });
      }

      const updatedRoom = await prisma.room.update({
        where: { id: roomEntity.id },
        data: {
          current_mode: mode,
          current_fan_status: fan,
        },
      });

      const { mqttPool } = require("../index");
      if (mqttPool) {
        await mqttPool.sendCommand(deviceId, roomIndex, mode, fan);
      }

      const description = `Control sent to ${roomEntity.room_name}: mode=${mode}, fan=${fan ? "ON" : "OFF"}`;
      await prisma.activityLog.create({
        data: {
          user_id: req.user.id,
          device_id: deviceId,
          event_type: "CONTROL_SENT",
          description,
        },
      });

      const { io } = require("../index");
      if (io) {
        io.emit("activity_log", {
          deviceId,
          description,
          eventType: "CONTROL_SENT",
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({
        message: "Control sent successfully",
        room: updatedRoom,
      });
    } catch (error) {
      console.error("Send control error:", error);
      return res.status(500).json({
        error: "Internal server error",
      });
    }
  }
}

module.exports = DeviceController;

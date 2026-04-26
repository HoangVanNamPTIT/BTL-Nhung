const mqtt = require("mqtt");

function normalizeBrokerUrl(rawUrl) {
  if (!rawUrl) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    const isWebSocket = parsed.protocol === "ws:" || parsed.protocol === "wss:";

    // HiveMQ Cloud WebSocket requires the /mqtt path.
    if (isWebSocket && (!parsed.pathname || parsed.pathname === "/")) {
      parsed.pathname = "/mqtt";
      return parsed.toString();
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

class MqttPool {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
    this.clients = new Map(); // Map<device_id, mqtt_client>
    this.subscriptions = new Map(); // Map<device_id, subscription_handler>
    this.lastTelemetryTime = new Map(); // Map<device_id, timestamp>
    this.offlineTimeouts = new Map(); // Map<device_id, timeout_id>
    this.TELEMETRY_TIMEOUT = 15000; // 15 seconds - mark offline if no data
  }

  /**
   * Initialize MQTT pool by fetching all claimed devices and their configs
   */
  async initialize() {
    console.log("Initializing MQTT Pool...");
    try {
      const devices = await this.prisma.device.findMany({
        where: {
          user_devices: {
            some: {},
          },
        },
        include: {
          mqtt_config: true,
        },
      });

      console.log(`Found ${devices.length} claimed device(s)`);

      for (const device of devices) {
        if (device.mqtt_config) {
          try {
            await this.connectDevice(device);
          } catch (err) {
            console.error(
              `Failed to connect device ${device.device_name}: ${err.message}`,
            );
            // Continue with next device instead of crashing
          }
        }
      }

      console.log("MQTT Pool initialized successfully");
    } catch (error) {
      console.error("Error initializing MQTT Pool:", error);
      throw error;
    }
  }

  /**
   * Connect a single device to MQTT broker
   */
  async connectDevice(device) {
    try {
      const config = device.mqtt_config;
      const clientId = `backend-${device.id}`;
      const brokerUrl = normalizeBrokerUrl(config.broker_url);

      const client = mqtt.connect(brokerUrl, {
        port: config.port,
        username: config.username,
        password: config.password,
        clientId: clientId,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
      });

      // Connection success
      client.on("connect", () => {
        console.log(
          `✓ Connected to MQTT broker for device ${device.device_name} (${device.id})`,
        );

        // Update device status
        this.prisma.device
          .update({
            where: { id: device.id },
            data: { status: "ONLINE", last_connected: new Date() },
          })
          .catch((err) => console.error("Error updating device status:", err));

        this.io.emit("activity_log", {
          deviceId: device.id,
          eventType: "DEVICE_ONLINE",
          description: `${device.device_name} is ONLINE`,
          timestamp: new Date().toISOString(),
        });

        // Reset telemetry tracking for this device
        this.lastTelemetryTime.set(device.id, Date.now());
        this.resetTelemetryTimeout(device.id, device.device_name);

        // Subscribe to both device-specific and legacy telemetry topics.
        client.subscribe(`air/data/${device.id}`, (err) => {
          if (err) {
            console.error(`Failed to subscribe to air/data/${device.id}:`, err);
          } else {
            console.log(`✓ Subscribed to air/data/${device.id}`);
          }
        });

        client.subscribe("air/data", (err) => {
          if (err) {
            console.error("Failed to subscribe to air/data:", err);
          } else {
            console.log("✓ Subscribed to air/data (legacy topic)");
          }
        });
      });

      // Handle incoming messages
      client.on("message", (topic, message) => {
        this.handleMqttMessage(device.id, topic, message);
      });

      // Connection error
      client.on("error", (error) => {
        console.error(
          `\n❌ MQTT Error for device ${device.device_name} (${device.id}):`,
          error.message,
          "\n",
        );
      });

      // Reconnect
      client.on("reconnect", () => {
        console.log(
          `\n🔄 Attempting to reconnect to MQTT broker for device ${device.device_name} (${device.id})...\n`,
        );
      });

      // Close connection
      client.on("close", () => {
        console.log(
          `\n⛔ MQTT connection closed for device ${device.device_name} (${device.id})\n`,
        );
      });

      // Offline
      client.on("offline", () => {
        console.log(
          `\n❌ DEVICE OFFLINE: ${device.device_name} (${device.id})\n`,
        );
        this.prisma.device
          .update({
            where: { id: device.id },
            data: { status: "OFFLINE" },
          })
          .catch((err) => console.error("Error updating device status:", err));

        this.io.emit("activity_log", {
          deviceId: device.id,
          eventType: "DEVICE_OFFLINE",
          description: `${device.device_name} is OFFLINE`,
          timestamp: new Date().toISOString(),
        });
      });

      // Store client in pool
      this.clients.set(device.id, client);
      console.log(`MQTT client created for device ${device.id}`);
    } catch (error) {
      console.error(`Error connecting device ${device.id}: ${error.message}`);
      // Don't throw - let caller handle per-device failures
    }
  }

  /**
   * Handle incoming MQTT message from air/data topic
   * Expected payload: { "rooms": [ { "id": 1, "value": 1319, "level": "MOD", "fan": false, "mode": "MANUAL", "sensor": "OK" }, ... ] }
   */
  async handleMqttMessage(deviceId, topic, message) {
    try {
      const payload = JSON.parse(message.toString());
      console.log(
        `[MQTT] 📨 Message from device ${deviceId} on topic ${topic}:`,
        JSON.stringify(payload).substring(0, 200),
      );

      if (topic.startsWith("air/data")) {
        // Process telemetry data
        await this.processTelemetryData(deviceId, payload);
      }
    } catch (error) {
      console.error(
        `Error processing MQTT message from device ${deviceId}:`,
        error,
      );
    }
  }

  /**
   * Process and save telemetry data to database
   */
  async processTelemetryData(deviceId, payload) {
    try {
      if (!payload.rooms || !Array.isArray(payload.rooms)) {
        console.warn("Invalid telemetry payload format for device:", deviceId);
        return;
      }

      console.log(
        `[Telemetry] 📊 Processing ${payload.rooms.length} rooms from device ${deviceId}`,
      );

      // Get device info for timeout reset
      const device = await this.prisma.device.findUnique({
        where: { id: deviceId },
        select: { device_name: true, status: true },
      });

      if (!device) {
        console.warn(`Device ${deviceId} not found in database`);
        return;
      }

      // If device was OFFLINE, mark it ONLINE on receiving telemetry
      if (device.status === "OFFLINE") {
        console.log(
          `\n[Telemetry] 🟢 DEVICE RECONNECTED: ${device.device_name} (${deviceId}) - telemetry received after offline\n`,
        );

        const updateResult = await this.prisma.device.update({
          where: { id: deviceId },
          data: { status: "ONLINE", last_connected: new Date() },
        });

        console.log(
          `[Telemetry] ✅ Database updated: ${device.device_name} status = ${updateResult.status}`,
        );

        const eventPayload = {
          deviceId: deviceId,
          eventType: "DEVICE_ONLINE",
          description: `${device.device_name} is ONLINE (telemetry resumed)`,
          timestamp: new Date().toISOString(),
        };

        console.log(
          `[Telemetry] 📤 Emitting DEVICE_ONLINE event:`,
          JSON.stringify(eventPayload),
        );

        // Broadcast to all connected clients
        this.io.emit("activity_log", eventPayload);
      }

      // Reset telemetry timeout
      this.resetTelemetryTimeout(deviceId, device.device_name);

      const now = new Date();
      const updates = [];

      for (const roomData of payload.rooms) {
        const roomIndex = roomData.id;

        // Find the room in database
        const room = await this.prisma.room.findFirst({
          where: {
            device_id: deviceId,
            room_index: roomIndex,
          },
        });

        if (!room) {
          console.warn(`Room ${roomIndex} not found for device ${deviceId}`);
          continue;
        }

        // Save telemetry data
        const telemetry = await this.prisma.telemetryData.create({
          data: {
            room_id: room.id,
            aqi_raw: roomData.value,
            aqi_level: roomData.level.trim(),
            fan_is_on: roomData.fan,
            timestamp: now,
          },
        });

        console.log(
          `[Telemetry]   Room ${room.room_name}: AQI=${roomData.value}, Level=${roomData.level.trim()}`,
        );

        // Update room status
        await this.prisma.room.update({
          where: { id: room.id },
          data: {
            current_fan_status: roomData.fan,
            current_mode: roomData.mode,
          },
        });

        updates.push({
          roomIndex,
          roomId: room.id,
          roomName: room.room_name,
          aqi_raw: roomData.value,
          aqi_level: roomData.level.trim(),
          fan_is_on: roomData.fan,
          mode: roomData.mode,
          sensor: roomData.sensor,
        });
      }

      // Broadcast to all connected clients via Socket.io
      if (updates.length > 0) {
        const rooms = updates.map((item) => ({
          id: item.roomIndex,
          roomId: item.roomId,
          roomName: item.roomName,
          value: item.aqi_raw,
          level: item.aqi_level,
          fan: item.fan_is_on,
          mode: item.mode,
          sensor: item.sensor,
        }));

        console.log(
          `[Telemetry] ✅ Broadcasting telemetry_update to clients for device ${deviceId}`,
        );

        this.io.emit("telemetry_update", {
          deviceId,
          rooms,
          timestamp: now.toISOString(),
        });

        // Backward compatibility for any existing listeners.
        this.io.emit("telemetry-update", {
          deviceId,
          data: updates,
          timestamp: now,
        });
      }
    } catch (error) {
      console.error(
        `Error processing telemetry data for device ${deviceId}:`,
        error,
      );
    }
  }

  /**
   * Send control command to device
   * Publish to air/control/{device_id} with payload: { "room": 1, "mode": "MANUAL", "fan": false }
   */
  async sendCommand(deviceId, room, mode, fan) {
    try {
      const client = this.clients.get(deviceId);

      if (!client) {
        throw new Error(`No MQTT client found for device ${deviceId}`);
      }

      if (!client.connected) {
        throw new Error(`Device ${deviceId} is not connected to MQTT broker`);
      }

      const payload = {
        room: room,
        mode: mode,
        fan: fan,
      };

      const topics = [`air/control/${deviceId}`, "air/control"];
      for (const topic of topics) {
        client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
          if (err) {
            console.error(`Error publishing to ${topic}:`, err);
          } else {
            console.log(`✓ Command sent to ${topic}:`, payload);
          }
        });
      }
    } catch (error) {
      console.error(`Error sending command to device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Close MQTT connection for a specific device
   */
  async disconnectDevice(deviceId) {
    try {
      const client = this.clients.get(deviceId);

      if (client) {
        await new Promise((resolve, reject) => {
          client.unsubscribe(`air/data/${deviceId}`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        await new Promise((resolve, reject) => {
          client.unsubscribe("air/data", (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        client.end(true);
        this.clients.delete(deviceId);
        console.log(`✓ Disconnected MQTT client for device ${deviceId}`);
      }
    } catch (error) {
      console.error(`Error disconnecting device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Close all MQTT connections
   */
  async closeAll() {
    console.log("Closing all MQTT connections...");
    for (const [deviceId, client] of this.clients.entries()) {
      await this.disconnectDevice(deviceId);
    }
  }

  /**
   * Get client for a specific device
   */
  getClient(deviceId) {
    return this.clients.get(deviceId);
  }

  /**
   * Check if device is connected
   */
  isConnected(deviceId) {
    const client = this.clients.get(deviceId);
    return client && client.connected;
  }

  /**
   * Reset telemetry timeout timer for device
   * If no telemetry received within TELEMETRY_TIMEOUT, mark device as OFFLINE
   */
  resetTelemetryTimeout(deviceId, deviceName) {
    // Clear existing timeout
    const existingTimeout = this.offlineTimeouts.get(deviceId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      console.log(`[Timeout] ⏱️  Cleared old timeout for device ${deviceId}`);
    }

    // Set new timeout
    const newTimeout = setTimeout(() => {
      console.log(
        `\n⏱️  TELEMETRY TIMEOUT: Device ${deviceName} (${deviceId}) - no data for ${this.TELEMETRY_TIMEOUT}ms\n`,
      );
      this.markDeviceOffline(deviceId, deviceName);
    }, this.TELEMETRY_TIMEOUT);

    this.offlineTimeouts.set(deviceId, newTimeout);
    this.lastTelemetryTime.set(deviceId, Date.now());
    console.log(
      `[Timeout] ⏱️  Started telemetry timeout for device ${deviceId} (${this.TELEMETRY_TIMEOUT}ms)`,
    );
  }

  /**
   * Mark device as offline - update database and emit event
   */
  async markDeviceOffline(deviceId, deviceName) {
    try {
      // Check current status - only emit if it was ONLINE
      const device = await this.prisma.device.findUnique({
        where: { id: deviceId },
      });

      if (!device) {
        console.warn(`Device ${deviceId} not found when marking offline`);
        return;
      }

      if (device.status === "OFFLINE") {
        console.log(`Device ${deviceId} already marked OFFLINE, skipping`);
        return;
      }

      console.log(`\n❌ MARKING DEVICE OFFLINE: ${deviceName} (${deviceId})\n`);

      // Update device status in database
      await this.prisma.device.update({
        where: { id: deviceId },
        data: { status: "OFFLINE" },
      });

      // Emit offline activity log
      this.io.emit("activity_log", {
        deviceId: deviceId,
        eventType: "DEVICE_OFFLINE",
        description: `${deviceName} is OFFLINE (no telemetry for ${this.TELEMETRY_TIMEOUT / 1000}s)`,
        timestamp: new Date().toISOString(),
      });

      console.log(`✅ Device ${deviceId} marked OFFLINE and event emitted`);
    } catch (error) {
      console.error(`Error marking device ${deviceId} as offline:`, error);
    }
  }
}

module.exports = MqttPool;

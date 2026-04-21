const mqtt = require('mqtt');

class MqttPool {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
    this.clients = new Map(); // Map<device_id, mqtt_client>
    this.subscriptions = new Map(); // Map<device_id, subscription_handler>
  }

  /**
   * Initialize MQTT pool by fetching all claimed devices and their configs
   */
  async initialize() {
    console.log('Initializing MQTT Pool...');
    try {
      const devices = await this.prisma.device.findMany({
        where: {
          owner_id: {
            not: null
          }
        },
        include: {
          mqtt_config: true
        }
      });

      console.log(`Found ${devices.length} claimed device(s)`);

      for (const device of devices) {
        if (device.mqtt_config) {
          await this.connectDevice(device);
        }
      }

      console.log('MQTT Pool initialized successfully');
    } catch (error) {
      console.error('Error initializing MQTT Pool:', error);
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

      const client = mqtt.connect(config.broker_url, {
        port: config.port,
        username: config.username,
        password: config.password,
        clientId: clientId,
        reconnectPeriod: 5000,
        connectTimeout: 10000
      });

      // Connection success
      client.on('connect', () => {
        console.log(`✓ Connected to MQTT broker for device ${device.device_name} (${device.id})`);

        // Update device status
        this.prisma.device.update({
          where: { id: device.id },
          data: { status: 'ONLINE', last_connected: new Date() }
        }).catch(err => console.error('Error updating device status:', err));

        // Subscribe to air/data topic
        client.subscribe(`air/data/${device.id}`, (err) => {
          if (err) {
            console.error(`Failed to subscribe to air/data/${device.id}:`, err);
          } else {
            console.log(`✓ Subscribed to air/data/${device.id}`);
          }
        });
      });

      // Handle incoming messages
      client.on('message', (topic, message) => {
        this.handleMqttMessage(device.id, topic, message);
      });

      // Connection error
      client.on('error', (error) => {
        console.error(`MQTT Error for device ${device.id}:`, error);
      });

      // Reconnect
      client.on('reconnect', () => {
        console.log(`Attempting to reconnect to MQTT broker for device ${device.id}...`);
      });

      // Offline
      client.on('offline', () => {
        console.log(`Device ${device.id} went offline`);
        this.prisma.device.update({
          where: { id: device.id },
          data: { status: 'OFFLINE' }
        }).catch(err => console.error('Error updating device status:', err));
      });

      // Store client in pool
      this.clients.set(device.id, client);
      console.log(`MQTT client created for device ${device.id}`);

    } catch (error) {
      console.error(`Error connecting device ${device.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming MQTT message from air/data topic
   * Expected payload: { "rooms": [ { "id": 1, "value": 1319, "level": "MOD", "fan": false, "mode": "MANUAL", "sensor": "OK" }, ... ] }
   */
  async handleMqttMessage(deviceId, topic, message) {
    try {
      const payload = JSON.parse(message.toString());

      if (topic.startsWith('air/data')) {
        // Process telemetry data
        await this.processTelemetryData(deviceId, payload);
      }
    } catch (error) {
      console.error(`Error processing MQTT message from device ${deviceId}:`, error);
    }
  }

  /**
   * Process and save telemetry data to database
   */
  async processTelemetryData(deviceId, payload) {
    try {
      if (!payload.rooms || !Array.isArray(payload.rooms)) {
        console.warn('Invalid telemetry payload format for device:', deviceId);
        return;
      }

      const now = new Date();
      const updates = [];

      for (const roomData of payload.rooms) {
        const roomIndex = roomData.id;

        // Find the room in database
        const room = await this.prisma.room.findFirst({
          where: {
            device_id: deviceId,
            room_index: roomIndex
          }
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
            timestamp: now
          }
        });

        // Update room status
        await this.prisma.room.update({
          where: { id: room.id },
          data: {
            current_fan_status: roomData.fan,
            current_mode: roomData.mode
          }
        });

        updates.push({
          roomId: room.id,
          roomName: room.room_name,
          aqi_raw: roomData.value,
          aqi_level: roomData.level.trim(),
          fan_is_on: roomData.fan,
          mode: roomData.mode,
          sensor: roomData.sensor
        });
      }

      // Broadcast to all connected clients via Socket.io
      if (updates.length > 0) {
        this.io.emit('telemetry-update', {
          deviceId: deviceId,
          data: updates,
          timestamp: now
        });
      }
    } catch (error) {
      console.error(`Error processing telemetry data for device ${deviceId}:`, error);
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
        fan: fan
      };

      const topic = `air/control/${deviceId}`;
      client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) {
          console.error(`Error publishing to ${topic}:`, err);
        } else {
          console.log(`✓ Command sent to ${topic}:`, payload);
        }
      });
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
    console.log('Closing all MQTT connections...');
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
}

module.exports = MqttPool;

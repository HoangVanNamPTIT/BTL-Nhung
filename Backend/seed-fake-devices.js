const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function seedFakeDevices() {
  try {
    console.log("🌱 Seeding fake devices...\n");

    // First, find the original device's MQTT config
    let originalDevice = await prisma.device.findUnique({
      where: { id: "c7338778-70dc-416f-a7ea-16feee4d45b9" },
      include: { mqtt_config: true },
    });

    let userId;

    // If original device doesn't exist, create it
    if (!originalDevice || !originalDevice.mqtt_config) {
      console.log("⚠️  Original device not found. Creating one...\n");

      // Get or create a user
      let user = await prisma.user.findFirst();
      if (!user) {
        console.log("📝 Creating test user...");
        user = await prisma.user.create({
          data: {
            email: "test@gmail.com",
            password_hash: "12345",
            full_name: "user1",
          },
        });
        console.log(`✓ Created user: ${user.full_name}`);
      }

      userId = user.id;

      // Create original device
      console.log("📱 Creating original device...");
      originalDevice = await prisma.device.create({
        data: {
          id: "c7338778-70dc-416f-a7ea-16feee4d45b9",
          mac_address: "AA:BB:CC:DD:EE:FF",
          claim_pin: "123456",
          device_name: "Original Device",
          owner_id: userId,
          status: "ONLINE",
          last_connected: new Date(),
        },
      });
      console.log(`✓ Created device: ${originalDevice.device_name}`);

      // Create MQTT config
      console.log("🔌 Creating MQTT config...");
      const mqttConfig = await prisma.mqttConfig.create({
        data: {
          device_id: originalDevice.id,
          broker_url: "wss://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud",
          port: 8884,
          username: "nhung1",
          password: "12345Nhung",
        },
      });
      console.log(`✓ Created MQTT config: ${mqttConfig.broker_url}\n`);

      // Create rooms for original device
      console.log("🏠 Creating rooms for original device...");
      const rooms = [
        {
          room_index: 1,
          room_name: "Room 1",
          current_mode: "AUTO",
          current_fan_status: false,
        },
        {
          room_index: 2,
          room_name: "Room 2",
          current_mode: "AUTO",
          current_fan_status: false,
        },
      ];

      for (const room of rooms) {
        await prisma.room.create({
          data: {
            device_id: originalDevice.id,
            room_index: room.room_index,
            room_name: room.room_name,
            current_mode: room.current_mode,
            current_fan_status: room.current_fan_status,
          },
        });
        console.log(`✓ Created room: ${room.room_name} for ${originalDevice.device_name}`);
      }

      originalDevice.mqtt_config = mqttConfig;
    } else {
      userId = originalDevice.owner_id;
      
      // Check if original device has rooms, if not create them
      const existingRooms = await prisma.room.count({
        where: { device_id: originalDevice.id },
      });

      if (existingRooms === 0) {
        console.log("🏠 Original device exists but has no rooms. Creating rooms...\n");
        const rooms = [
          {
            room_index: 1,
            room_name: "Room 1",
            current_mode: "AUTO",
            current_fan_status: false,
          },
          {
            room_index: 2,
            room_name: "Room 2",
            current_mode: "AUTO",
            current_fan_status: false,
          },
        ];

        for (const room of rooms) {
          await prisma.room.create({
            data: {
              device_id: originalDevice.id,
              room_index: room.room_index,
              room_name: room.room_name,
              current_mode: room.current_mode,
              current_fan_status: room.current_fan_status,
            },
          });
          console.log(`✓ Created room: ${room.room_name} for ${originalDevice.device_name}`);
        }
      }
    }

    console.log(`✓ Found original device: ${originalDevice.device_name}`);
    console.log(
      `✓ Found MQTT config: ${originalDevice.mqtt_config.broker_url}`,
    );

    // Create 3 fake devices sharing the same MQTT config
    const fakeDevices = [
      {
        mac_address: "FA:KE:21:B6:9E:32",
        device_name: "Living Room Device",
        claim_pin: "654321",
      },
      {
        mac_address: "FA:KE:21:B6:9E:33",
        device_name: "Bedroom Device",
        claim_pin: "654321",
      },
      {
        mac_address: "FA:KE:21:B6:9E:34",
        device_name: "Office Device",
        claim_pin: "654321",
      },
    ];

    for (const fakeDevice of fakeDevices) {
      const existingDevice = await prisma.device.findUnique({
        where: { mac_address: fakeDevice.mac_address },
      });

      if (existingDevice) {
        console.log(
          `⏭️  Device ${fakeDevice.device_name} already exists, skipping...`,
        );
        continue;
      }

      const newDevice = await prisma.device.create({
        data: {
          mac_address: fakeDevice.mac_address,
          claim_pin: fakeDevice.claim_pin,
          device_name: fakeDevice.device_name,
          owner_id: userId,
          status: "ONLINE",
          last_connected: new Date(),
        },
      });

      console.log(`✓ Created device: ${newDevice.device_name}`);

      // Create MQTT config for this device (same as original)
      const mqttConfig = await prisma.mqttConfig.create({
        data: {
          device_id: newDevice.id,
          broker_url: originalDevice.mqtt_config.broker_url,
          port: originalDevice.mqtt_config.port,
          username: originalDevice.mqtt_config.username,
          password: originalDevice.mqtt_config.password,
        },
      });

      console.log(`✓ Created MQTT config for ${newDevice.device_name}`);

      // Create 2 rooms for each fake device (same as original)
      const rooms = [
        {
          room_index: 1,
          room_name: "Room 1",
          current_mode: "AUTO",
          current_fan_status: false,
        },
        {
          room_index: 2,
          room_name: "Room 2",
          current_mode: "AUTO",
          current_fan_status: false,
        },
      ];

      for (const room of rooms) {
        const newRoom = await prisma.room.create({
          data: {
            device_id: newDevice.id,
            room_index: room.room_index,
            room_name: room.room_name,
            current_mode: room.current_mode,
            current_fan_status: room.current_fan_status,
          },
        });

        console.log(
          `✓ Created room: ${newRoom.room_name} for ${newDevice.device_name}`,
        );
      }
    }

    console.log("\n✅ Seeding complete!");

    // Show all devices
    const allDevices = await prisma.device.findMany({
      include: { rooms: true },
    });

    console.log(`\n📊 Total devices in database: ${allDevices.length}`);
    allDevices.forEach((device) => {
      console.log(
        `  - ${device.device_name} (${device.mac_address}) [${device.status}] - ${device.rooms.length} rooms`,
      );
    });
  } catch (error) {
    console.error("❌ Error seeding devices:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedFakeDevices();

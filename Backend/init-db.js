const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function initializeDatabase() {
  try {
    console.log("🚀 Initializing database with complete data...\n");

    // ====================================================
    // 1. Create Users
    // ====================================================
    console.log("📝 Creating users...");
    const passwordHash = await bcrypt.hash("123456", 10);

    const user1 = await prisma.user.create({
      data: {
        email: "a@test.com",
        password_hash: passwordHash,
        full_name: "User A",
        role: "user",
      },
    });

    const user2 = await prisma.user.create({
      data: {
        email: "b@test.com",
        password_hash: passwordHash,
        full_name: "User B",
        role: "user",
      },
    });

    console.log(`✓ Created users: ${user1.email}, ${user2.email}`);
    console.log(`  Password for both: 123456\n`);

    // ====================================================
    // 2. Create Devices with technical names
    // ====================================================
    console.log("📝 Creating devices...");
    const devices = await Promise.all([
      prisma.device.create({
        data: {
          mac_address: "FA:KE:21:B6:9E:30",
          claim_pin: "654321",
          device_name: "AQM-Station-Production-Line-A",
          status: "OFFLINE",
        },
      }),
      prisma.device.create({
        data: {
          mac_address: "FA:KE:21:B6:9E:31",
          claim_pin: "654321",
          device_name: "AQM-Station-Production-Line-B",
          status: "OFFLINE",
        },
      }),
      prisma.device.create({
        data: {
          mac_address: "FA:KE:21:B6:9E:32",
          claim_pin: "654321",
          device_name: "AQM-Station-Assembly-Area",
          status: "OFFLINE",
        },
      }),
      prisma.device.create({
        data: {
          mac_address: "FA:KE:21:B6:9E:33",
          claim_pin: "654321",
          device_name: "AQM-Station-Warehouse-Zone",
          status: "OFFLINE",
        },
      }),
      prisma.device.create({
        data: {
          mac_address: "FA:KE:21:B6:9E:34",
          claim_pin: "654321",
          device_name: "AQM-Station-Quality-Lab",
          status: "OFFLINE",
        },
      }),
    ]);

    console.log(`✓ Created ${devices.length} devices\n`);

    // ====================================================
    // 3. Create Rooms (2 per device)
    // ====================================================
    console.log("📝 Creating rooms...");
    const rooms = [];
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];

      const room1 = await prisma.room.create({
        data: {
          device_id: device.id,
          room_index: 1,
          room_name: "Inlet Air Quality Zone",
          current_mode: "MANUAL",
          current_fan_status: false,
        },
      });

      const room2 = await prisma.room.create({
        data: {
          device_id: device.id,
          room_index: 2,
          room_name: "Outlet Air Quality Zone",
          current_mode: "MANUAL",
          current_fan_status: false,
        },
      });

      rooms.push(room1, room2);
    }

    console.log(`✓ Created ${rooms.length} rooms (2 per device)\n`);

    // ====================================================
    // 4. Create MQTT Configs (Disabled for now - use public broker)
    // ====================================================
    console.log(
      "📝 Skipping MQTT configurations (use valid credentials later)\n",
    );
    // NOTE: To enable MQTT, provide valid credentials:
    // - Broker: mqtts://your-broker.hivemq.cloud or mqtt://test.mosquitto.org
    // - Username/Password: Valid credentials for your broker
    // - Port: 8883 for mqtts, 1883 for mqtt

    // ====================================================
    // 5. User-Device Relationships (Skipped - Leave Empty)
    // ====================================================
    console.log("📝 Skipping user-device relationships (table left empty)\n");

    // ====================================================
    // 6. Create Sample Telemetry Data
    // ====================================================
    console.log("📝 Creating sample telemetry data...");
    const telemetryData = [];
    for (const room of rooms) {
      const data = await prisma.telemetryData.create({
        data: {
          room_id: room.id,
          aqi_raw: Math.floor(Math.random() * 300),
          aqi_level: ["GOOD", "MOD", "BAD"][Math.floor(Math.random() * 3)],
          fan_is_on: Math.random() > 0.5,
          timestamp: new Date(Date.now() - Math.random() * 60 * 60 * 1000), // Random within last hour
        },
      });
      telemetryData.push(data);
    }

    console.log(`✓ Created ${telemetryData.length} telemetry records\n`);

    // ====================================================
    // 7. Create Activity Logs
    // ====================================================
    console.log("📝 Creating activity logs...");
    const activityLogs = [];

    for (const device of devices) {
      const log = await prisma.activityLog.create({
        data: {
          user_id: user1.id,
          device_id: device.id,
          event_type: "DEVICE_CLAIMED",
          description: `Factory admin claimed ${device.device_name}`,
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        },
      });
      activityLogs.push(log);
    }

    const controlLog = await prisma.activityLog.create({
      data: {
        user_id: user2.id,
        device_id: devices[0].id,
        event_type: "CONTROL_SENT",
        description:
          "Control sent to Inlet Air Quality Zone: mode=AUTO, fan=ON",
        timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 min ago
      },
    });
    activityLogs.push(controlLog);

    console.log(`✓ Created ${activityLogs.length} activity logs\n`);

    // ====================================================
    // Summary
    // ====================================================
    console.log("═══════════════════════════════════════════════");
    console.log("✨ DATABASE INITIALIZATION COMPLETE! ✨");
    console.log("═══════════════════════════════════════════════\n");

    console.log("📊 Data Summary:");
    console.log(`  • Users: 2`);
    console.log(`    - a@test.com (role: user)`);
    console.log(`    - b@test.com (role: user)`);
    console.log(`    - Password for both: 123456\n`);

    console.log(`  • Devices: ${devices.length}`);
    devices.forEach((d) =>
      console.log(`    - ${d.device_name} (${d.mac_address})`),
    );
    console.log(`    - Claim PIN for all: 654321\n`);

    console.log(`  • Rooms: ${rooms.length} (2 per device)`);
    console.log(`  • MQTT Configs: 0 (disabled - add valid credentials later)`);
    console.log(`  • User-Device Relationships: 0 (table left empty)`);
    console.log(`  • Telemetry Records: ${telemetryData.length}`);
    console.log(`  • Activity Logs: ${activityLogs.length}\n`);

    console.log("🚀 You can now start the backend server:");
    console.log("   npm start\n");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run initialization
initializeDatabase();

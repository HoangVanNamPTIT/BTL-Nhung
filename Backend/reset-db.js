const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function resetDatabase() {
  try {
    console.log("🔄 Resetting database...");

    // Delete all data in order to avoid foreign key conflicts
    await prisma.telemetryData.deleteMany({});
    console.log("✓ Deleted telemetry data");

    await prisma.activityLog.deleteMany({});
    console.log("✓ Deleted activity logs");

    await prisma.userDevice.deleteMany({});
    console.log("✓ Deleted user-device relationships");

    await prisma.room.deleteMany({});
    console.log("✓ Deleted rooms");

    await prisma.mqttConfig.deleteMany({});
    console.log("✓ Deleted MQTT configs");

    await prisma.device.deleteMany({});
    console.log("✓ Deleted devices");

    await prisma.user.deleteMany({});
    console.log("✓ Deleted users");

    console.log("\n✓ Database reset successfully!");
    console.log("\n📝 Next steps:");
    console.log("1. Open MySQL Workbench");
    console.log("2. Go to File -> Open SQL Script");
    console.log("3. Select: Backend/init-db.sql");
    console.log("4. Execute the script to initialize the database");
  } catch (error) {
    console.error("❌ Error resetting database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetDatabase();

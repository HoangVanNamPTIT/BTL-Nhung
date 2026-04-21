const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function updateMqttConfig() {
  try {
    console.log("🔧 Updating MQTT configurations to real broker...\n");

    // Find all MQTT configs and update to HiveMQ
    const configs = await prisma.mqttConfig.findMany();

    for (const config of configs) {
      await prisma.mqttConfig.update({
        where: { id: config.id },
        data: {
          broker_url:
            "mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud",
          port: 8883,
          username: "nhung1",
          password: "12345Nhung",
        },
      });

      console.log(`✓ Updated: ${config.device_id}`);
    }

    console.log("\n✨ All MQTT configs updated to HiveMQ Cloud!");
    console.log("\n📋 Configuration:");
    console.log(
      "  Broker: mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud",
    );
    console.log("  Port: 8883 (TLS)");
    console.log("  Username: nhung1");
    console.log("  Password: 12345Nhung\n");
  } catch (error) {
    console.error("❌ Error updating MQTT config:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateMqttConfig();

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const MqttPool = require("./services/MqttPool");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const prisma = new PrismaClient();
const mqttPool = new MqttPool(prisma, io);

// Prevent "Do not know how to serialize a BigInt" when returning Prisma rows.
app.set("json replacer", (key, value) =>
  typeof value === "bigint" ? value.toString() : value,
);

// Middleware
app.use(cors());
app.use(express.json());

// Socket.io connection
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/devices", require("./routes/devices"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/telemetry", require("./routes/telemetry"));
app.use("/api/activity", require("./routes/activity"));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

// Initialize and start server
const startServer = async () => {
  try {
    // Initialize MQTT Pool with all claimed devices
    await mqttPool.initialize();

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await mqttPool.closeAll();
  await prisma.$disconnect();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

startServer();

module.exports = { app, server, io, prisma, mqttPool };

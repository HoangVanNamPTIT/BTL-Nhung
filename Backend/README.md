# Air Quality & Smart Control IoT System - Backend

Node.js/Express backend for multi-room air quality monitoring, smart control, and firmware OTA management.

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with database, JWT_SECRET, MQTT credentials, etc.

# 3. Setup database
npx prisma migrate deploy

# 4. Start server
npm run dev
```

Server runs on **http://localhost:5000**

## 📚 Documentation

Complete documentation is available in `/doc` folder:

- **[BACKEND-SETUP-GUIDE.md](../doc/BACKEND-SETUP-GUIDE.md)** - Complete installation and configuration (Prerequisites, Database setup, MQTT config, Firmware setup, Running, Testing, Troubleshooting)
- **[BACKEND-SYSTEM-DESIGN.md](../doc/BACKEND-SYSTEM-DESIGN.md)** - System architecture, Database schema, MQTT patterns, API endpoints, Authentication, Error handling

## 📋 Tech Stack

- Node.js + Express.js (Port 5000)
- Prisma ORM + MySQL 8.0+
- MQTT (HiveMQ Cloud or local Mosquitto)
- JWT Authentication
- Socket.io for real-time communication
- Multer for firmware file uploads

## 📂 Project Structure

```
Backend/
├── src/
│   ├── index.js                     # Server entry point
│   ├── controllers/                 # Request handlers
│   │   ├── AuthController.js
│   │   ├── DeviceController.js
│   │   ├── RoomController.js
│   │   ├── TelemetryController.js
│   │   ├── ActivityController.js
│   │   └── firmwareController.js
│   ├── services/
│   │   └── MqttPool.js              # MQTT client pool
│   ├── routes/                      # API routes
│   ├── middleware/                  # Authentication, etc.
│   └── utils/                       # JWT utilities
├── prisma/
│   ├── schema.prisma                # Database models
│   └── migrations/                  # Database migrations
├── config/
│   └── ota.config.js                # OTA configuration
├── uploads/firmware/                # Firmware files storage
├── .env                             # Environment variables
└── package.json
```

## 🔧 Available Commands

```bash
npm run dev              # Development mode (auto-reload)
npm start               # Production mode
npm run prisma:studio   # Open Prisma Studio (database UI)
npm run prisma:migrate  # Run database migrations
```

## 🔌 Core Features

### Device Management
- Multi-device support (ESP32 IoT devices)
- Device claiming via MAC address
- Real-time device status tracking
- Activity logging

### Telemetry
- Sensor data collection (AQI, CO2, PM2.5, Temperature, Humidity)
- Per-room data logging
- Historical data storage

### Firmware OTA
- Firmware upload with MD5 verification
- Batch device updates
- Real-time progress tracking
- MAC address-based device confirmation

### MQTT Communication
- Dynamic client pool (one per device)
- Telemetry: Device → Backend (`air/data/{device_id}`)
- Commands: Backend → Device (`air/updatefirmware`)
- Status updates: Device → Backend (`air/firmwareupdatestatus`)

### Real-time Updates
- Socket.io for instant notifications
- HTTP polling fallback for firmware updates

## 🔐 Authentication

- JWT-based (Bearer token)
- Automatic token generation on login
- Protected routes via middleware

```bash
# Example: Get your profile
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/auth/me
```

## 📊 Database Models

- **User**: User accounts and authentication
- **Device**: IoT devices with MAC addresses
- **Room**: Room configurations per device
- **Telemetry**: Time-series sensor data
- **Firmware**: Firmware versions with tracking
- **FirmwareUpdateLog**: OTA update history
- **ActivityLog**: System event audit trail

See [BACKEND-SYSTEM-DESIGN.md](../doc/BACKEND-SYSTEM-DESIGN.md) for complete schema details.

## ⚠️ Requirements

- Node.js v18+
- MySQL 8.0+
- MQTT Broker (HiveMQ Cloud or local)

## 🐛 Troubleshooting

See [BACKEND-SETUP-GUIDE.md - Troubleshooting Section](../doc/BACKEND-SETUP-GUIDE.md#troubleshooting) for common issues and solutions.

## 📖 Environment Variables

See [BACKEND-SETUP-GUIDE.md](../doc/BACKEND-SETUP-GUIDE.md#environment-configuration) for complete .env configuration details.

Key variables:
- `DATABASE_URL`: MySQL connection string
- `JWT_SECRET`: Secret key for JWT signing
- `MQTT_BROKER`, `MQTT_PORT`: MQTT broker address
- `MQTT_USERNAME`, `MQTT_PASSWORD`: MQTT credentials
- `FIRMWARE_DOWNLOAD_URL`: Base URL for firmware downloads

## 💡 Quick Examples

### Start Backend
```bash
npm run dev
# Backend ready at http://localhost:5000
```

### View Database
```bash
npm run prisma:studio
# Opens interactive database UI at http://localhost:5555
```

### Test API Health
```bash
curl http://localhost:5000/api/health
```

## 📖 More Information

For detailed information on:
- **Installation steps** → See [BACKEND-SETUP-GUIDE.md](../doc/BACKEND-SETUP-GUIDE.md)
- **System architecture & API endpoints** → See [BACKEND-SYSTEM-DESIGN.md](../doc/BACKEND-SYSTEM-DESIGN.md)
- **Database schema details** → See [BACKEND-SYSTEM-DESIGN.md](../doc/BACKEND-SYSTEM-DESIGN.md#database-schema)
- **MQTT communication** → See [BACKEND-SYSTEM-DESIGN.md](../doc/BACKEND-SYSTEM-DESIGN.md#mqtt-communication-pattern)
- **Troubleshooting** → See [BACKEND-SETUP-GUIDE.md](../doc/BACKEND-SETUP-GUIDE.md#troubleshooting)

---

**Last Updated**: 2026-04-28

Opens interactive database browser at `http://localhost:5555`

### Database Migrations
```bash
npm run prisma:migrate      # Create and run migration
npm run prisma:migrate:deploy  # Deploy existing migration
```

## Troubleshooting

**Cannot connect to database:**
- Check `DATABASE_URL` in `.env`
- Ensure MySQL service is running
- Verify database exists

**MQTT connection failed:**
- Check broker URL and credentials
- Verify network connectivity
- Check device MQTT config in database

**JWT token invalid:**
- Regenerate token via login endpoint
- Check `JWT_SECRET` is consistent across app

## Next Steps

1. Setup Frontend (React)
2. Connect devices with MQTT credentials
3. Test end-to-end data flow
4. Deploy to production

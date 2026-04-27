# Air Quality & Smart Control IoT System - Backend System Design

## 📋 Mục lục
1. [Tổng quan hệ thống](#tổng-quan-hệ-thống)
2. [Kiến trúc Backend](#kiến-trúc-backend)
3. [Database Schema](#database-schema)
4. [MQTT Communication Pattern](#mqtt-communication-pattern)
5. [Firmware OTA System](#firmware-ota-system)
6. [API Endpoints](#api-endpoints)
7. [Authentication & Security](#authentication--security)
8. [Real-time Features](#real-time-features)
9. [Error Handling & Logging](#error-handling--logging)

---

## Tổng quan hệ thống

### Mục đích
Quản lý hệ thống IoT đa phòng với các chức năng:
- Giám sát chất lượng không khí (AQI, CO2, PM2.5, Nhiệt độ, Độ ẩm)
- Điều khiển thiết bị thông minh (quạt, cửa sổ, buzzer, chế độ)
- Cập nhật firmware OTA (Over-The-Air)
- Ghi nhận nhật ký hoạt động (Activity Log)
- Xác thực người dùng và quản lý thiết bị

### Stack Công nghệ
- **Backend**: Node.js + Express.js (Port 5000)
- **Database**: MySQL 8.0+ với Prisma ORM
- **IoT Communication**: MQTT (HiveMQ Cloud)
- **Real-time**: Socket.io v4.8.3
- **Authentication**: JWT (JSON Web Tokens)
- **File Storage**: Local filesystem (uploads/firmware)

---

## Kiến trúc Backend

### Directory Structure
```
Backend/
├── src/
│   ├── index.js                 # Server entry point
│   ├── controllers/
│   │   ├── AuthController.js    # User login/auth
│   │   ├── DeviceController.js  # Device management
│   │   ├── RoomController.js    # Room control
│   │   ├── TelemetryController.js # Data fetch
│   │   ├── ActivityController.js # Activity logs
│   │   └── firmwareController.js # OTA management
│   ├── services/
│   │   └── MqttPool.js          # MQTT client pool + handlers
│   ├── routes/
│   │   ├── auth.js
│   │   ├── devices.js
│   │   ├── rooms.js
│   │   ├── telemetry.js
│   │   ├── activity.js
│   │   └── firmwareRoutes.js
│   ├── middleware/
│   │   └── auth.js              # JWT verification
│   └── utils/
│       └── jwt.js               # JWT sign/verify
├── prisma/
│   ├── schema.prisma            # Database models
│   └── migrations/              # Database migrations
├── config/
│   └── ota.config.js            # OTA download URL config
├── .env                         # Environment variables
└── package.json
```

### Layer Architecture

```
┌─────────────────────────────────────────┐
│         Frontend (React/Vite)           │
│      http://localhost:5173              │
└───────────────┬─────────────────────────┘
                │ HTTP API + Socket.io
                ▼
┌─────────────────────────────────────────┐
│         Express.js Server               │
│      http://localhost:5000              │
├─────────────────────────────────────────┤
│  Routes → Controllers → Services → DB  │
└───────────────┬───────────┬─────────────┘
                │           │
                ▼ HTTP      ▼ Socket.io
            MySQL DB   Real-time Events
                │
                ▼ MQTT Bridge
        ┌───────────────────────┐
        │   MQTT Client Pool    │
        │  (HiveMQ Cloud)       │
        └───────────┬───────────┘
                    │ Publish/Subscribe
                    ▼
        ┌───────────────────────┐
        │  ESP32 Devices        │
        │  (MQTT Clients)       │
        └───────────────────────┘
```

---

## Database Schema

### Main Models

#### 1. **User**
```prisma
model User {
  id                String   @id @default(cuid())
  email             String   @unique
  password_hash     String
  full_name         String?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  devices           Device[]
  activity_logs     ActivityLog[]
}
```

#### 2. **Device**
```prisma
model Device {
  id                String   @id @default(cuid())
  device_name       String
  mac_address       String   @unique
  status            String   @default("OFFLINE")  // ONLINE/OFFLINE
  firmware_version  String?
  user_id           String?
  
  rooms             Room[]
  telemetry         Telemetry[]
  activity_logs     ActivityLog[]
  firmware_logs     FirmwareUpdateLog[]
  user              User?    @relation(fields: [user_id], references: [id])
  
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
}
```

#### 3. **Room**
```prisma
model Room {
  id                String   @id @default(cuid())
  device_id         String
  room_name         String
  mode              String   @default("auto")     // manual/auto/sleep
  fan_enabled       Boolean  @default(false)
  fan_speed         Int?
  window_position   Int      @default(0)          // 0-100%
  buzzer_enabled    Boolean  @default(false)
  
  device            Device   @relation(fields: [device_id], references: [id], onDelete: Cascade)
  telemetry         Telemetry[]
  
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  @@unique([device_id, room_name])
}
```

#### 4. **Telemetry**
```prisma
model Telemetry {
  id                String   @id @default(cuid())
  device_id         String
  room_id           String
  aqi               Int      // 0-500
  co2               Int      // ppm
  pm25              Float    // µg/m³
  temperature       Float    // °C
  humidity          Float    // %
  
  device            Device   @relation(fields: [device_id], references: [id], onDelete: Cascade)
  room              Room     @relation(fields: [room_id], references: [id], onDelete: Cascade)
  
  created_at        DateTime @default(now())
  
  @@index([device_id])
  @@index([room_id])
}
```

#### 5. **Firmware**
```prisma
model Firmware {
  id                String   @id @default(cuid())
  version           String   @unique
  filename          String   // Hash-based filename (storage)
  original_filename String   // Original uploaded filename
  file_path         String
  file_size         Int
  md5_hash          String   @unique
  release_notes     String?
  is_active         Boolean  @default(true)
  download_count    Int      @default(0)
  uploaded_by       String?
  
  update_logs       FirmwareUpdateLog[]
  
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
}
```

#### 6. **FirmwareUpdateLog**
```prisma
model FirmwareUpdateLog {
  id                String   @id @default(cuid())
  firmware_id       String
  device_id         String
  status            String   // pending/success/failed
  error_message     String?
  
  firmware          Firmware @relation(fields: [firmware_id], references: [id], onDelete: Cascade)
  device            Device   @relation(fields: [device_id], references: [id], onDelete: Cascade)
  
  started_at        DateTime @default(now())
  completed_at      DateTime?
  created_at        DateTime @default(now())
  
  @@unique([firmware_id, device_id])
}
```

#### 7. **ActivityLog**
```prisma
model ActivityLog {
  id                String   @id @default(cuid())
  device_id         String?
  user_id           String?
  event_type        String   // DEVICE_ONLINE/OFFLINE, OTA_UPDATE, etc.
  description       String
  
  device            Device?  @relation(fields: [device_id], references: [id], onDelete: SetNull)
  user              User?    @relation(fields: [user_id], references: [id], onDelete: SetNull)
  
  created_at        DateTime @default(now())
  
  @@index([device_id])
  @@index([user_id])
}
```

---

## MQTT Communication Pattern

### Topics & Structure

| Topic | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `air/data/{device_id}` | Device → Backend | JSON telemetry | Send sensor readings |
| `air/data` | Device → Backend | JSON telemetry | Broadcast to all |
| `air/updatefirmware` | Backend → Device | `{url, version}` | Trigger OTA update |
| `air/firmwareupdatestatus` | Device → Backend | `{mac, status, version}` | Report update result |
| `air/{device_id}/control` | Backend → Device | `{mode, fan, window}` | Control commands |

### Telemetry Payload
```json
{
  "mac_address": "FA:KE:21:B6:9E:30",
  "rooms": [
    {
      "room_name": "Phòng khách",
      "aqi": 45,
      "co2": 350,
      "pm25": 12.5,
      "temperature": 22.5,
      "humidity": 55.0
    }
  ]
}
```

### Firmware Update Payload
```json
{
  "url": "http://backend:5000/api/firmware/download/1.0.3",
  "version": "1.0.3"
}
```

### Firmware Status Payload
```json
{
  "mac_address": "FA:KE:21:B6:9E:30",
  "status": "success",
  "version": "1.0.3",
  "error": null
}
```

---

## Firmware OTA System

### Update Flow

```
Frontend             Backend              MQTT              Device
   │                   │                   │                 │
   │─ POST /trigger ───>│                   │                 │
   │                   │ Create Log        │                 │
   │                   ├─ (pending)        │                 │
   │ Show Progress     │                   │                 │
   │<─ {sessionId} ────│                   │                 │
   │                   │ Publish on MQTT ──────────────────>│
   │                   │                   │                 │
   │ Frontend Polling  │                   │ Device Downloads│
   │ GET /status       │                   │ & Flashes      │
   │<─ {status}───────│<──────────────────────── Sends Status
   │ 50%→100%         │ Update Log        │                 │
   │                   │ (success/failed)  │                 │
```

### Components

#### Backend: triggerBatchOTAUpdate
- Receives version + device IDs
- Creates FirmwareUpdateLog entries (status: pending)
- Publishes MQTT to each device
- Returns sessionId for tracking

#### Backend: handleFirmwareUpdateStatus (MQTT Handler)
- Receives device confirmation on `air/firmwareupdatestatus`
- Matches device by MAC address
- Updates FirmwareUpdateLog (status: success/failed)
- Creates ActivityLog entry
- Emits Socket.io event (real-time UI update)

#### Frontend: Polling
- When modal opens, starts polling GET `/api/firmware/status`
- Every 500ms checks update progress
- Updates UI progress bar (50% → 100%)
- Stops when modal closes

#### Polling Endpoint: GET `/api/firmware/status`
```javascript
// Query: version=X&deviceIds=id1,id2
// Response:
{
  version: "1.0.3",
  updateStatuses: [
    {
      deviceId: "...",
      deviceName: "MOI MUA HOM QUA",
      macAddress: "FA:KE:21:B6:9E:30",
      status: "success",
      progress: 100,
      error: null
    }
  ],
  successCount: 1,
  failedCount: 0,
  pendingCount: 0
}
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/login       # Login with email/password
POST   /api/auth/logout      # Logout
GET    /api/auth/me          # Get current user
```

### Devices
```
GET    /api/devices          # List all devices
POST   /api/devices/claim    # Claim device by MAC
PUT    /api/devices/:id      # Update device info
DELETE /api/devices/:id      # Delete device
```

### Rooms
```
GET    /api/rooms/:deviceId  # Get rooms for device
PUT    /api/rooms/:roomId    # Update room control (mode/fan/window)
```

### Telemetry
```
GET    /api/telemetry/:deviceId  # Latest sensor data
GET    /api/telemetry/:deviceId/history  # Historical data
```

### Firmware
```
POST   /api/firmware/upload           # Upload firmware file
GET    /api/firmware                  # List all firmware
GET    /api/firmware/:id/logs         # Update history
GET    /api/firmware/status           # Polling: Get update status
GET    /api/firmware/download/:version # Download firmware
POST   /api/firmware/trigger-batch    # Trigger batch OTA
DELETE /api/firmware/:id              # Delete firmware
PATCH  /api/firmware/:id              # Edit firmware info
```

### Activity
```
GET    /api/activity         # Get activity logs
```

---

## Authentication & Security

### JWT Flow
1. Frontend sends credentials to `/api/auth/login`
2. Backend verifies against database
3. Backend generates JWT token (HS256 signature)
4. Frontend stores JWT in localStorage
5. Frontend includes JWT in all requests: `Authorization: Bearer <token>`
6. Backend middleware verifies JWT on protected routes

### Middleware: auth.js
```javascript
verifyToken(req, res, next) {
  1. Extract token from Authorization header
  2. Verify signature using JWT_SECRET
  3. Decode to get user.id
  4. Attach user to req.user
  5. Allow next() if valid
}
```

### Environment Security
- `JWT_SECRET`: Never commit to git, load from .env
- `DATABASE_URL`: Stored securely in .env
- `MQTT_*`: Per-device passwords stored in database

---

## Real-time Features

### Socket.io Integration

#### Server Setup (index.js)
```javascript
io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000
})

io.on("connection", (socket) => {
  // Handle events
})
```

#### Events Emitted
- `telemetry_update`: Real-time sensor data
- `activity_log`: New activity entries
- `firmware_update_status`: OTA progress (deprecated, now using polling)

#### Events Received
- `socket:join_room`: Join room for updates
- `socket:leave_room`: Leave room

---

## Error Handling & Logging

### Logging Strategy
```javascript
// Format: [Module] 🎯 Action: Message
console.log("[MQTT] ✅ Device connected: device-123")
console.error("[OTA] ❌ Failed to update device: reason")
console.warn("[DB] ⚠️ Connection timeout, retrying...")
```

### Error Categories

| Category | HTTP | Meaning |
|----------|------|---------|
| Authentication Error | 401 | Missing/invalid JWT |
| Authorization Error | 403 | User not allowed |
| Validation Error | 400 | Invalid input |
| Not Found | 404 | Resource doesn't exist |
| Server Error | 500 | Unexpected error |

### MQTT Error Handling
```javascript
client.on("error", (error) => {
  // Reconnect logic
  // Exponential backoff
  // Log detailed error
})

client.on("offline", () => {
  // Queue pending messages
  // Notify frontend
})
```

---

## Dependencies

### Production
- `express`: Web framework
- `prisma`: ORM
- `@prisma/client`: Prisma client
- `mysql2`: MySQL driver
- `mqtt`: MQTT client
- `socket.io`: Real-time communication
- `jsonwebtoken`: JWT auth
- `bcrypt`: Password hashing
- `multer`: File upload

### Development
- `nodemon`: Auto-restart on changes
- `dotenv`: Environment variables

---

## Performance Considerations

1. **Database Indexing**
   - Index on `device_id`, `room_id` in Telemetry
   - Index on `mac_address` in Device
   - Unique constraints on version, email, mac_address

2. **Query Optimization**
   - Use `include()` carefully to avoid N+1 queries
   - Select only needed fields with `select()`
   - Implement pagination for large datasets

3. **MQTT Connection Pool**
   - Reuse connections instead of creating new ones
   - Implement connection pooling in MqttPool.js

4. **Caching**
   - Could add Redis for session/frequent queries
   - Cache firmware list (rarely changes)

5. **Firmware Files**
   - Store on local filesystem or S3
   - Generate download URLs with expiration
   - Validate MD5 hash before update

---

## Future Enhancements

- [ ] Redis caching layer
- [ ] PostgreSQL for better scaling
- [ ] S3/Cloud storage for firmware
- [ ] Advanced monitoring dashboard
- [ ] Device firmware rollback capability
- [ ] Batch operations for multiple devices
- [ ] Device groups/zones
- [ ] Scheduled controls (cron jobs)
- [ ] Historical data export (CSV/JSON)

# Air Quality & Smart Control IoT System - Backend

Node.js/Express backend for multi-room air quality monitoring and smart control system.

## Tech Stack

- Node.js + Express.js
- Prisma ORM + MySQL
- MQTT Client
- JWT Authentication
- Socket.io for real-time communication

## Project Structure

```
src/
├── controllers/       # Request handlers
├── services/         # Business logic & MQTT pool
├── routes/           # API route definitions
├── middleware/       # Authentication & other middleware
├── utils/            # Helper functions (JWT, etc.)
└── index.js          # Main server file

prisma/
├── schema.prisma     # Database schema
└── migrations/       # Database migrations
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL`: MySQL connection string
- `JWT_SECRET`: Secret key for JWT signing
- `PORT`: Server port (default: 5000)
- `MQTT_*`: Default MQTT config (per-device config stored in DB)

### 3. Setup MySQL Database

Create a new MySQL database:

```sql
CREATE DATABASE air_quality_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. Run Prisma Migrations

```bash
npm run prisma:migrate
```

This will:
- Generate Prisma client
- Create tables from schema
- Create migration files

### 5. Start the Server

**Development** (with auto-reload):
```bash
npm run dev
```

**Production**:
```bash
npm start
```

Server will run on `http://localhost:5000`

## Database Schema

### Core Tables

- **users**: User accounts with JWT auth
- **devices**: ESP32 hardware devices (MAC address, ownership, status)
- **mqtt_configs**: MQTT broker credentials per device (1-to-1)
- **rooms**: Room configurations per device (1 device → N rooms)
- **telemetry_data**: Time-series air quality data per room
- **activity_logs**: Audit trail of user actions and system events

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/profile` - Get user profile

### Devices
- `GET /api/devices` - List user's devices
- `GET /api/devices/:id` - Get device details
- `POST /api/devices/claim` - Claim new device
- `POST /api/devices/:id/release` - Release device
- `PUT /api/devices/:id/settings` - Update device settings
- `GET /api/devices/:id/telemetry` - Get device telemetry

### Rooms
- `GET /api/rooms/:roomId` - Get room details
- `PUT /api/rooms/:roomId/mode` - Change room mode (AUTO/MANUAL)
- `PUT /api/rooms/:roomId/fan` - Control fan (ON/OFF)
- `GET /api/rooms/:roomId/telemetry` - Get room telemetry

### Telemetry
- `GET /api/telemetry/room/:roomId` - Get latest data
- `GET /api/telemetry/room/:roomId/history` - Get historical data

### Activity
- `GET /api/activity/user/:userId` - Get user activity logs
- `GET /api/activity/device/:deviceId` - Get device activity logs
- `GET /api/activity` - Get all activity logs

## MQTT Integration

### Dynamic Connection Pool

The backend maintains a pool of MQTT clients (one per claimed device):

- On startup: Fetches all claimed devices and their MQTT configs, establishes connections
- On device claim: Creates new MQTT client dynamically
- On device release: Closes MQTT client
- Real-time: Subscribes to `air/data/{device_id}`, publishes to `air/control/{device_id}`

### MQTT Topics

**Subscribe** (Device → Backend):
```
air/data/{device_id}

Payload:
{
  "rooms": [
    {"id":1,"value":1319,"level":"MOD","fan":false,"mode":"MANUAL","sensor":"OK"},
    {"id":2,"value":1758,"level":"MOD","fan":false,"mode":"MANUAL","sensor":"OK"}
  ]
}
```

**Publish** (Backend → Device):
```
air/control/{device_id}

Payload:
{
  "room": 1,
  "mode": "MANUAL",
  "fan": false
}
```

## Real-time Communication (Socket.io)

WebSocket events for real-time dashboard updates:

**From Server:**
```javascript
io.emit('telemetry-update', {
  deviceId: 'device-uuid',
  data: [
    {
      roomId: 'room-uuid',
      roomName: 'Living Room',
      aqi_raw: 1319,
      aqi_level: 'MOD',
      fan_is_on: false,
      mode: 'MANUAL'
    }
  ],
  timestamp: Date.now()
});
```

## Testing

### Health Check
```bash
curl http://localhost:5000/health
```

### Register User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","full_name":"John Doe"}'
```

## Environment Requirements

- Node.js 14+
- MySQL 8.0+
- MQTT Broker (HiveMQ Cloud or similar)

## Development

### Prisma Studio (GUI for database)
```bash
npm run prisma:studio
```

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

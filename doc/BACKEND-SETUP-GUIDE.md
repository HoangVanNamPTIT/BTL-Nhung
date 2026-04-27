# Backend Setup & Configuration Guide

## 📋 Mục lục
1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [MQTT Configuration](#mqtt-configuration)
6. [Firmware Configuration](#firmware-configuration)
7. [Running Backend](#running-backend)
8. [Testing & Verification](#testing--verification)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Đảm bảo có các công cụ sau:

### Required
- **Node.js** v18+ (download từ https://nodejs.org/)
  ```bash
  node --version  # Check version
  npm --version
  ```
- **MySQL** v8.0+
  - Option 1: Install locally từ https://dev.mysql.com/downloads/mysql/
  - Option 2: Docker: `docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root mysql:8.0`

### Optional but Recommended
- **Git** (manage source code)
- **Docker** & **Docker Compose** (easier setup)
- **Postman** (API testing)
- **MySQL Workbench** (database management UI)

---

## Installation

### Step 1: Clone Repository
```bash
cd c:\Users\hoang\BTL-Nhung
# Repository đã được clone, navigate to Backend
cd Backend
```

### Step 2: Install Dependencies
```bash
npm install
```

Dependencies sẽ cài vào `node_modules/`:
- express, prisma, mysql2, mqtt, socket.io, etc.

### Step 3: Verify Installation
```bash
npm list | head -20  # Check main packages
```

Should show:
```
BTL-Nhung-Backend@1.0.0
├── @prisma/client@6.19.3
├── bcrypt@5.1.1
├── dotenv@16.4.5
├── express@4.18.2
├── mqtt@5.3.4
├── multer@1.4.5-lts.1
├── socket.io@4.8.3
└── ... other dependencies
```

---

## Environment Configuration

### Step 1: Create .env File

Navigate to Backend folder and create `.env`:

```bash
cd c:\Users\hoang\BTL-Nhung\Backend
# Create .env file (Windows)
type nul > .env
```

Or using PowerShell:
```powershell
New-Item .env -ItemType File
```

### Step 2: Add Environment Variables

Edit `.env` with contents below:

```env
# ============= SERVER =============
PORT=5000
NODE_ENV=development

# ============= DATABASE =============
DATABASE_URL="mysql://root:root@localhost:3306/air_quality_db"
# Format: mysql://username:password@host:port/database_name
# Example for Docker: mysql://root:root@host.docker.internal:3306/air_quality_db

# ============= JWT =============
JWT_SECRET=your_secret_key_here_change_this_in_production
# Use strong random string: $(openssl rand -base64 32)

# ============= MQTT - HiveMQ Cloud =============
MQTT_BROKER=your-hivemq-broker.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=your_hivemq_username
MQTT_PASSWORD=your_hivemq_password
MQTT_USE_TLS=true

# Alternative: Local MQTT Broker
# MQTT_BROKER=localhost
# MQTT_PORT=1883
# MQTT_USE_TLS=false
# MQTT_USERNAME=
# MQTT_PASSWORD=

# ============= FIRMWARE =============
FIRMWARE_DOWNLOAD_URL=http://localhost:5000/api/firmware/download
# For production: https://your-domain.com/api/firmware/download
```

### Step 3: Validate .env

Verify `.env` exists:
```bash
ls -la .env  # Linux/Mac
dir .env    # Windows PowerShell
```

---

## Database Setup

### Step 1: Create MySQL Database

Option A: Using MySQL CLI
```bash
mysql -u root -p
# Enter password: root

# In MySQL console:
CREATE DATABASE air_quality_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE air_quality_db;
EXIT;
```

Option B: Using MySQL Workbench
1. Open MySQL Workbench
2. Connect to localhost (root/root)
3. Right-click "Databases" → "Create Database"
4. Database name: `air_quality_db`
5. Character set: `utf8mb4`
6. Collation: `utf8mb4_unicode_ci`
7. Click "Apply"

Option C: Using Docker
```bash
docker exec -it mysql_container mysql -u root -p -e "CREATE DATABASE air_quality_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### Step 2: Run Prisma Migrations

```bash
cd Backend

# Generate Prisma client (first time)
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Or create fresh schema
npx prisma db push
```

Expected output:
```
✔ Prisma schema validated
✔ Database connection successful
✔ 5 migrations executed
Database ready!
```

### Step 3: Verify Database Schema

```bash
# Open Prisma Studio (interactive UI)
npx prisma studio
# Opens http://localhost:5555

# Or use MySQL CLI
mysql -u root -proot air_quality_db
SHOW TABLES;
DESC users;
DESC devices;
DESC firmware;
EXIT;
```

### Step 4: Seed Initial Data (Optional)

Create `Backend/seed.js`:
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create test user
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      password_hash: '$2b$10$...', // bcrypt hash of "password"
      full_name: 'Test User'
    }
  });
  console.log('Created user:', user);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run seed:
```bash
node seed.js
```

---

## MQTT Configuration

### Option 1: HiveMQ Cloud (Recommended for Production)

#### 1.1: Create HiveMQ Cloud Account

1. Go to https://www.hivemq.com/
2. Sign up for free account
3. Create a new cluster
4. Get credentials:
   - **Broker Host**: `abc123-xyz456.s1.eu.hivemq.cloud`
   - **Port**: `8883` (TLS) or `1883` (no TLS)
   - **Username/Password**: Create from dashboard

#### 1.2: Update .env

```env
MQTT_BROKER=abc123-xyz456.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
MQTT_USE_TLS=true
```

#### 1.3: Test Connection

```bash
npm run dev
# Check console for: "[MQTT] ✅ Connected to broker"
```

### Option 2: Local MQTT Broker (Development)

#### 2.1: Install Mosquitto

**Windows**: Download from https://mosquitto.org/download/

**Docker** (recommended):
```bash
docker run -d -p 1883:1883 -p 9001:9001 --name mosquitto eclipse-mosquitto:latest
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

#### 2.2: Update .env

```env
MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_USE_TLS=false
MQTT_USERNAME=
MQTT_PASSWORD=
```

#### 2.3: Test Connection

```bash
# Subscribe to test topic
mosquitto_sub -h localhost -t "air/data" -v

# In another terminal, publish
mosquitto_pub -h localhost -t "air/data" -m "test message"
```

---

## Firmware Configuration

### Step 1: Create Firmware Directory

```bash
mkdir -p uploads/firmware
```

### Step 2: Create OTA Config

File: `Backend/config/ota.config.js`

```javascript
module.exports = {
  // Download URL for devices to fetch firmware
  getDownloadUrl: (version) => {
    const baseUrl = process.env.FIRMWARE_DOWNLOAD_URL || 'http://localhost:5000/api/firmware/download';
    return `${baseUrl}/${version}`;
  },

  // File storage settings
  storage: {
    uploadDir: './uploads/firmware',
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },

  // OTA update settings
  update: {
    timeout: 300000, // 5 minutes
    retries: 3,
    backoffMultiplier: 1.5,
  }
};
```

### Step 3: Prepare Firmware File

1. Get firmware binary from Arduino build:
   - Path: `ArduinoCode/final_code/build/esp32.esp32.esp32/final_code.ino.bin`
   - Or: `ArduinoCode/update/final_code_update/build/esp32.esp32.esp32/final_code_update.ino.bin`

2. Rename for clarity:
   ```
   firmware-v1.0.0.bin
   firmware-v1.0.1.bin
   firmware-v1.0.3.bin
   ```

### Step 4: Upload Initial Firmware (Via API)

```bash
# Using curl
curl -X POST http://localhost:5000/api/firmware/upload \
  -F "firmwareFile=@./firmware-v1.0.3.bin" \
  -F "version=1.0.3" \
  -F "releaseNotes=Initial release with sensor calibration"

# Using Postman:
# 1. Create POST request to http://localhost:5000/api/firmware/upload
# 2. Form-data:
#    - firmwareFile: [select binary file]
#    - version: 1.0.3
#    - releaseNotes: Initial release
# 3. Send
```

Expected response:
```json
{
  "message": "Upload firmware thành công",
  "firmware": {
    "id": "clq...",
    "version": "1.0.3",
    "original_filename": "firmware-v1.0.3.bin",
    "file_size": 1048576,
    "md5_hash": "abc123...",
    "is_active": true,
    "created_at": "2026-04-28T10:00:00Z"
  }
}
```

---

## Running Backend

### Option 1: Development Mode (Recommended)

```bash
cd Backend
npm run dev
```

**Features**:
- Auto-restart on file changes (nodemon)
- Detailed logging
- Source maps for debugging

Expected output:
```
[nodemon] starting 'node src/index.js'
✅ Database connected
[MQTT] ✅ Connected to broker at ...
🚀 Server running on port 5000
```

### Option 2: Production Mode

```bash
npm start
# Or:
node src/index.js
```

### Option 3: Docker

```bash
# Build image
docker build -t air-quality-backend .

# Run container
docker run -p 5000:5000 \
  --env-file .env \
  air-quality-backend
```

### Verify Backend is Running

```bash
# Check health
curl http://localhost:5000/api/health

# Should return 200 OK
```

---

## Testing & Verification

### Test 1: Database Connection

```bash
npm run dev
# Should show: "✅ Database connected"
```

### Test 2: MQTT Connection

```bash
npm run dev
# Should show: "[MQTT] ✅ Connected to broker at <broker_url>"
```

### Test 3: API Endpoints

```bash
# Health check
curl http://localhost:5000/api/health

# Get firmware list (no auth required for now)
curl http://localhost:5000/api/firmware

# Should return JSON with firmware list
```

### Test 4: Authentication (Optional)

Create test user:
```bash
# In MySQL:
mysql -u root -proot air_quality_db
INSERT INTO users (id, email, password_hash, full_name, created_at, updated_at)
VALUES ('test-user-1', 'test@example.com', 'hashed_password', 'Test User', NOW(), NOW());
EXIT;
```

### Test 5: MQTT Message Simulation

```bash
# If using local Mosquitto, publish test telemetry
mosquitto_pub -h localhost -t "air/data/test-device-1" -m '{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "rooms": [
    {
      "room_name": "Phòng khách",
      "aqi": 50,
      "co2": 350,
      "pm25": 12.5,
      "temperature": 22.5,
      "humidity": 55.0
    }
  ]
}'

# Check backend logs for: "[MQTT] ✅ Message processed"
```

### Test 6: Firmware Upload & Download

```bash
# Upload firmware
curl -X POST http://localhost:5000/api/firmware/upload \
  -F "firmwareFile=@firmware-v1.0.3.bin" \
  -F "version=1.0.3" \
  -F "releaseNotes=Test firmware"

# Download firmware
curl http://localhost:5000/api/firmware/download/1.0.3 \
  -o downloaded-firmware.bin

# Verify MD5
md5sum downloaded-firmware.bin
# Should match uploaded file MD5
```

---

## Troubleshooting

### Issue 1: Database Connection Failed

**Error**: `Can't connect to MySQL server on 'localhost:3306'`

**Solutions**:
```bash
# Check MySQL is running
sudo systemctl status mysql  # Linux
# Or check Docker: docker ps | grep mysql

# Check connection string in .env
# Format: mysql://username:password@host:port/database

# Test connection manually
mysql -u root -proot -h localhost
# If fails, MySQL not running or wrong password
```

### Issue 2: MQTT Connection Timeout

**Error**: `MQTT connection timeout` or `Cannot connect to broker`

**Solutions**:
```bash
# For local Mosquitto:
# 1. Check if running
docker ps | grep mosquitto
# 2. Restart
docker restart mosquitto

# For HiveMQ Cloud:
# 1. Check credentials in .env
# 2. Verify IP whitelist in HiveMQ dashboard
# 3. Test with mosquitto_pub:
mosquitto_pub -h <broker_url> -p 8883 -u <user> -P <pass> --cafile ca.crt -t test -m "test"
```

### Issue 3: Port 5000 Already in Use

**Error**: `Error: listen EADDRINUSE :::5000`

**Solutions**:
```bash
# Find process using port 5000
# Windows:
netstat -ano | findstr :5000

# Kill process
taskkill /PID <PID> /F

# Or use different port:
PORT=5001 npm run dev
```

### Issue 4: Prisma Migration Fails

**Error**: `Error: P1000: Authentication failed` or migration errors

**Solutions**:
```bash
# Reset and rebuild
npx prisma migrate reset
# This will drop and recreate database

# Or manually:
mysql -u root -proot air_quality_db -e "DROP DATABASE air_quality_db; CREATE DATABASE air_quality_db;"
npx prisma migrate deploy
```

### Issue 5: Firmware Upload Fails

**Error**: `ENOENT: no such file or directory, open 'uploads/firmware'`

**Solutions**:
```bash
# Create directory
mkdir -p uploads/firmware

# Check permissions
chmod 755 uploads/firmware

# Verify exists
ls -la uploads/
```

### Issue 6: Frontend Cannot Connect to Backend

**Error**: Frontend shows "Connection failed" or CORS errors

**Solutions**:
```javascript
// Check CORS config in Backend/src/index.js
// Should include frontend URL:
cors: {
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000"
  ],
  credentials: true
}

// Restart backend
npm run dev
```

### Debug Mode

Enable detailed logging:

```bash
# Add to .env
DEBUG=*

# Run backend
npm run dev
# Will show detailed logs from all modules
```

---

## Quick Start Commands

```bash
# Complete setup from scratch
cd Backend
npm install
npx prisma migrate deploy
npm run dev

# Restart backend
npm run dev

# Check database
npx prisma studio

# View backend logs
npm run dev 2>&1 | tee backend.log

# Stop backend
Ctrl + C
```

---

## Production Deployment Checklist

- [ ] Change JWT_SECRET to strong random value
- [ ] Update DATABASE_URL to production MySQL
- [ ] Update MQTT_BROKER to production broker
- [ ] Set NODE_ENV=production
- [ ] Change FIRMWARE_DOWNLOAD_URL to production domain
- [ ] Enable HTTPS/TLS for all connections
- [ ] Set up proper error monitoring (Sentry, etc.)
- [ ] Configure automated backups for database
- [ ] Set up log aggregation
- [ ] Configure Docker for deployment
- [ ] Use environment-specific config files

---

## Support & Documentation

For issues or questions:
1. Check troubleshooting section above
2. Review backend logs: `npm run dev`
3. Check database with: `npx prisma studio`
4. Verify MQTT connection: `mosquitto_pub/sub`
5. Test API with Postman

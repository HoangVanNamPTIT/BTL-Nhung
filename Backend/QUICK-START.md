# 🚀 Air Quality Monitoring System - Quick Start Guide

## ✅ Database Ready!

Dữ liệu đã được khởi tạo hoàn chỉnh. Backend server đang chạy trên **http://localhost:5000**

---

## 👥 Tài Khoản Đăng Nhập

| Email        | Password | Role              |
| ------------ | -------- | ----------------- |
| `a@test.com` | `123456` | Admin (5 devices) |
| `b@test.com` | `123456` | User (3 devices)  |

---

## 📱 5 Thiết Bị

| #   | Tên Thiết Bị                  | MAC Address       | Claim PIN |
| --- | ----------------------------- | ----------------- | --------- |
| 1   | AQM-Station-Production-Line-A | FA:KE:21:B6:9E:30 | 654321    |
| 2   | AQM-Station-Production-Line-B | FA:KE:21:B6:9E:31 | 654321    |
| 3   | AQM-Station-Assembly-Area     | FA:KE:21:B6:9E:32 | 654321    |
| 4   | AQM-Station-Warehouse-Zone    | FA:KE:21:B6:9E:33 | 654321    |
| 5   | AQM-Station-Quality-Lab       | FA:KE:21:B6:9E:34 | 654321    |

**Mỗi device có 2 rooms:**

- Inlet Air Quality Zone
- Outlet Air Quality Zone

---

## 🌐 MQTT Configuration

**HiveMQ Cloud Broker:**

```
Broker URL: mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud
Port: 8883 (TLS/SSL)
Username: nhung1
Password: 12345Nhung
```

**WebSocket (Optional):**

```
wss://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud:8884/mqtt
```

---

## 🔌 API Endpoints

### 1. Login

```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "a@test.com",
  "password": "123456"
}
```

**Response:**

```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "user-1",
    "email": "a@test.com",
    "full_name": "User A",
    "role": "admin"
  }
}
```

### 2. List Devices

```bash
GET http://localhost:5000/api/devices
Authorization: Bearer <token>
```

### 3. Get Device Details

```bash
GET http://localhost:5000/api/devices/{device_id}
Authorization: Bearer <token>
```

### 4. Get Telemetry

```bash
GET http://localhost:5000/api/devices/{device_id}/telemetry?hours=24&limit=100
Authorization: Bearer <token>
```

### 5. Send Control Command

```bash
POST http://localhost:5000/api/devices/control
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceId": "device_id",
  "room": "1",
  "mode": "AUTO",
  "fan": true
}
```

### 6. Update Device Settings

```bash
PUT http://localhost:5000/api/devices/{device_id}/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "device_name": "New Name",
  "rooms": [
    {
      "id": "room_id_1",
      "room_name": "New Room Name 1"
    },
    {
      "id": "room_id_2",
      "room_name": "New Room Name 2"
    }
  ]
}
```

### 7. Get Activity Logs

```bash
GET http://localhost:5000/api/activity?type=all
Authorization: Bearer <token>
```

---

## 📊 Database Structure

- **Users:** 2 accounts
- **Devices:** 5 devices
- **Rooms:** 10 rooms (2 per device)
- **MQTT Configs:** 5 (1 per device)
- **User-Device Relationships:** 8 (a@test.com: 5, b@test.com: 3)
- **Telemetry Records:** 10 samples
- **Activity Logs:** 6 entries

---

## 🔧 Management Scripts

### Reset Database

```bash
cd Backend
node reset-db.js
```

### Initialize Database

```bash
node init-db.js
```

### Update MQTT Configs

```bash
node fix-mqtt-config.js
```

---

## 📋 Files Reference

| File                     | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `init-db.js`             | Create all initial data (users, devices, rooms, etc.)  |
| `reset-db.js`            | Delete all data to start fresh                         |
| `init-db.sql`            | SQL script for manual database setup (MySQL Workbench) |
| `DATABASE-INIT-GUIDE.md` | Detailed initialization guide                          |
| `README-INIT.md`         | Comprehensive documentation                            |

---

## 🎯 Next Steps

1. **Test Login:**
   - Use Postman or cURL
   - Login with `a@test.com` / `123456`
   - Save the JWT token

2. **List Devices:**
   - Use token from login
   - GET /api/devices
   - Should return 5 devices

3. **Claim Devices (Optional):**
   - If needed, claim additional devices
   - POST /api/devices/claim with MAC & PIN

4. **Monitor Telemetry:**
   - GET /api/devices/{id}/telemetry
   - Check air quality data

5. **Send Commands:**
   - POST /api/devices/control
   - Toggle fan, change mode, etc.

---

## 🐛 Troubleshooting

**Q: Port 5000 already in use?**

```bash
# Kill all node processes
taskkill /IM node.exe /F
# Then restart backend
npm start
```

**Q: MQTT connection errors?**

- Check broker URL: `mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud`
- Check credentials: `nhung1` / `12345Nhung`
- Check port: `8883` (TLS)

**Q: Cannot find database?**

```bash
# Make sure MySQL is running and air_quality_db exists
mysql -u root -p -e "CREATE DATABASE air_quality_db;"
```

**Q: Frontend not connecting?**

- Check backend URL in `Frontend/frontend/src/utils/api.js`
- Should be: `http://localhost:5000`
- Check CORS headers in backend

---

## 📞 Database Credentials

```env
DATABASE_URL="mysql://root:password@localhost:3306/air_quality_db"
```

Modify in `Backend/.env` if needed.

---

**Status:** ✅ Ready to use
**Backend Port:** 5000
**Database:** air_quality_db
**Updated:** April 21, 2026

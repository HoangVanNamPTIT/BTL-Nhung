# 🏭 Air Quality Monitoring System - Database Initialization

## ✅ Hoàn Thành

Dữ liệu database đã được khởi tạo thành công! Hệ thống sẵn sàng để test.

### 📊 Dữ Liệu Được Tạo

**2 Tài Khoản User:**

- `a@test.com` (Admin role) - Quyền truy cập tất cả 5 thiết bị
- `b@test.com` (User role) - Quyền truy cập 3 thiết bị

Password cho cả 2 tài khoản: `123456`

**5 Thiết Bị với Tên Kĩ Thuật:**
| # | Tên Thiết Bị | MAC Address | Claim PIN | Rooms |
|---|---|---|---|---|
| 1 | AQM-Station-Production-Line-A | FA:KE:21:B6:9E:30 | 654321 | Inlet + Outlet |
| 2 | AQM-Station-Production-Line-B | FA:KE:21:B6:9E:31 | 654321 | Inlet + Outlet |
| 3 | AQM-Station-Assembly-Area | FA:KE:21:B6:9E:32 | 654321 | Inlet + Outlet |
| 4 | AQM-Station-Warehouse-Zone | FA:KE:21:B6:9E:33 | 654321 | Inlet + Outlet |
| 5 | AQM-Station-Quality-Lab | FA:KE:21:B6:9E:34 | 654321 | Inlet + Outlet |

**10 Rooms:**

- 2 rooms per device (Inlet Air Quality Zone + Outlet Air Quality Zone)
- Tất cả đã kết nối với thiết bị

**MQTT Configurations:**

- 5 MQTT configs (1 per device)
- Broker: mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud:8883 (HiveMQ Cloud)
- Username: nhung1
- Password: 12345Nhung

**Sample Data:**

- 10 Telemetry records
- 6 Activity logs
- 8 User-Device relationships

---

## 🚀 Cách Sử Dụng

### 1. Start Backend Server

```bash
cd Backend
npm start
```

### 2. Test API

#### Login

```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "a@test.com",
  "password": "123456"
}
```

#### Add Device (Claim Device)

```bash
POST http://localhost:5000/api/devices/claim
Authorization: Bearer <token từ login>
Content-Type: application/json

{
  "mac_address": "FA:KE:21:B6:9E:30",
  "claim_pin": "654321",
  "device_name": "AQM-Station-Production-Line-A",
  "mqtt_config": {
    "broker_url": "mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud",
    "port": 8883,
    "username": "nhung1",
    "password": "12345Nhung"
  }
}
```

#### List Devices

```bash
GET http://localhost:5000/api/devices
Authorization: Bearer <token>
```

#### Get Device Details

```bash
GET http://localhost:5000/api/devices/{device_id}
Authorization: Bearer <token>
```

#### Get Telemetry Data

```bash
GET http://localhost:5000/api/devices/{device_id}/telemetry?hours=24&limit=100
Authorization: Bearer <token>
```

#### Update Device Settings

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

#### Send Control Command

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

#### Get Activity Logs

```bash
GET http://localhost:5000/api/activity?type=all
Authorization: Bearer <token>
```

---

## 📁 Files Tạo Ra

### Database Scripts

- **`init-db.js`** - Script khởi tạo dữ liệu (đã chạy)
- **`reset-db.js`** - Script reset database
- **`init-db.sql`** - SQL script (để phòng trường hợp)

### Documentation

- **`DATABASE-INIT-GUIDE.md`** - Hướng dẫn chi tiết
- **`README-INIT.md`** - File này

---

## 🔄 Nếu Cần Reset Database

```bash
node reset-db.js
node init-db.js
```

---

## ⚠️ Lưu Ý

1. **Devices chưa claimed** - Khi bắt đầu, tất cả devices đều ở trạng thái OFFLINE vì chưa được claim qua API
2. **Rooms tự động** - Mỗi device đã có 2 rooms từ lúc tạo, không cần tạo thêm khi claim
3. **MQTT** - Devices sẽ cố kết nối MQTT khi được claim thành công
4. **Telemetry** - Sample data có timestamp ngẫu nhiên trong 1 giờ gần nhất
5. **Activity Logs** - Được tạo để test xem lịch sử hoạt động

---

## 🐛 Troubleshooting

**Q: Lỗi "Device already claimed"?**

- A: Device đã được claimed bởi user khác hoặc đã exists trong UserDevice table

**Q: Frontend hiển thị "Smart Device" thay vì tên thiết bị?**

- A: Khi claim device, hãy gửi `device_name` trong request body hoặc dùng tên từ database

**Q: Rooms không hiển thị?**

- A: Check xem device đã claim chưa. Rooms được tạo lúc device được tạo, không phải lúc claim

**Q: MQTT không kết nối?**

- A: Kiểm tra MQTT config, đảm bảo broker_url đúng (hiện sử dụng mqtt.example.com - fake)

---

## 📝 Tiếp Theo

Sau khi test xong, có thể:

1. Cập nhật MQTT broker_url thành broker thực tế
2. Tạo thêm devices/rooms nếu cần
3. Implement real-time updates via Socket.IO
4. Integrate frontend với backend API

---

**Created on:** April 21, 2026
**System:** Air Quality Monitoring System (Factory)

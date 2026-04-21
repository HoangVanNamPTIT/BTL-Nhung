# Hướng dẫn Load Database Initialization

## 1. Database đã được reset ✓

Chạy lệnh: `node reset-db.js`

- Xóa tất cả dữ liệu cũ
- Chuẩn bị database sạch

## 2. Load dữ liệu từ init-db.sql

### Option A: MySQL Workbench (Recommended)

1. Mở MySQL Workbench
2. Click vào database `air_quality_db`
3. Vào menu `File` → `Open SQL Script`
4. Chọn file: `Backend/init-db.sql`
5. Bấm nút **Execute** (⚡ icon)
6. Xác nhận khi được hỏi

### Option B: Command Line (MySQL CLI)

```bash
mysql -h localhost -u root -p air_quality_db < Backend\init-db.sql
```

(Nhập password khi được hỏi)

## 3. Verify Dữ Liệu

```sql
SELECT * FROM users;
SELECT * FROM devices;
SELECT * FROM rooms;
SELECT * FROM user_devices;
SELECT * FROM mqtt_configs;
```

## 4. Tài Khoản Đăng Nhập

### User A

- Email: `a@test.com`
- Password: `123456`

### User B

- Email: `b@test.com`
- Password: `123456`

## 5. Thiết Bị (5 cái)

| Tên                           | MAC Address       | Claim PIN | Rooms             |
| ----------------------------- | ----------------- | --------- | ----------------- |
| AQM-Station-Production-Line-A | FA:KE:21:B6:9E:30 | 654321    | Inlet/Outlet Zone |
| AQM-Station-Production-Line-B | FA:KE:21:B6:9E:31 | 654321    | Inlet/Outlet Zone |
| AQM-Station-Assembly-Area     | FA:KE:21:B6:9E:32 | 654321    | Inlet/Outlet Zone |
| AQM-Station-Warehouse-Zone    | FA:KE:21:B6:9E:33 | 654321    | Inlet/Outlet Zone |
| AQM-Station-Quality-Lab       | FA:KE:21:B6:9E:34 | 654321    | Inlet/Outlet Zone |

## 6. MQTT Configuration

**Broker Details:**

- Broker URL: `mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud`
- Port: `8883` (TLS/SSL)
- Username: `nhung1`
- Password: `12345Nhung`
- Protocol: MQTT over TLS (Secure)

**HiveMQ Cloud Endpoints:**

- MQTT TLS: `mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud:8883`
- WebSocket TLS: `wss://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud:8884/mqtt`

Tất cả 5 devices đều kết nối tới broker này.

## 6. Dữ Liệu được tạo

- ✓ 2 Users (Admin + Engineer)
- ✓ 5 Devices (với tên kĩ thuật)
- ✓ 10 Rooms (2 rooms/device: Inlet + Outlet)
- ✓ 5 MQTT Configs
- ✓ 8 User-Device relationships
- ✓ 10 Telemetry samples (cho test)
- ✓ 7 Activity logs

## 7. Lưu ý

- Tất cả ID được tạo thủ công để tránh conflict
- Passwords sử dụng bcrypt hash từ password "123456"
- Devices mặc định có status OFFLINE (chờ kết nối)
- Mỗi device tự động có 2 rooms: Inlet + Outlet Air Quality Zone

## Restart Backend

Sau khi load xong, restart backend:

```bash
npm start
```

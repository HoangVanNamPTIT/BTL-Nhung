# Xây Dựng Hệ Thống Nhúng Giám Sát Chất Lượng Không Khí Đa Phòng

**Embedded IoT Air Quality Monitoring System with Multi-Room Support**

---

## 📋 Mục Lục

1. [Tóm Tắt Dự Án](#tóm-tắt-dự-án)
2. [Mục Tiêu & Phạm Vi](#mục-tiêu--phạm-vi)
3. [Kiến Trúc Hệ Thống](#kiến-trúc-hệ-thống)
4. [Yêu Cầu Hệ Thống](#yêu-cầu-hệ-thống)
5. [Công Nghệ Áp Dụng](#công-nghệ-áp-dụng)
6. [Stack Kỹ Thuật](#stack-kỹ-thuật)
7. [Triển Khai Hệ Thống](#triển-khai-hệ-thống)
8. [Hướng Dẫn Sử Dụng](#hướng-dẫn-sử-dụng)
9. [Tài Liệu Tham Khảo](#tài-liệu-tham-khảo)

---

## 1. Tóm Tắt Dự Án

### 1.1 Mô Tả

Dự án này xây dựng một **hệ thống nhúng (embedded system)** cho phép giám sát chất lượng không khí trong môi trường đa phòng. Hệ thống được thiết kế theo mô hình **hybrid offline-first** với khả năng hoạt động độc lập hoàn toàn mà không cần kết nối internet, đồng thời hỗ trợ kết nối tùy chọn với cloud/backend khi có WiFi.

### 1.2 Đặc Điểm Nổi Bật

- **Tự Động Độc Lập**: Hoạt động 100% tự động trong chế độ offline (không WiFi)
- **Dual-Core Processing**: Tối ưu hóa hiệu năng bằng cách sử dụng 2 core của ESP32 (Core 0: Networking, Core 1: Computing)
- **Real-Time Operating System**: Sử dụng FreeRTOS để quản lý 6 task độc lập
- **Persistent State Management**: Lưu trạng thái thông qua RTC backup memory
- **Failover Tự Động**: Tự động chuyển đổi giữa chế độ offline/online
- **Remote Management**: Quản lý từ xa thông qua web dashboard khi có kết nối
- **OTA Firmware Update**: Cập nhật firmware không cần USB khi kết nối MQTT

### 1.3 Ứng Dụng

- Hành lang, phòng khách, văn phòng
- Bệnh viện, trường học, thư viện
- Nhà thông minh, bảo tàng, nhà kho
- Không gian công cộng cần giám sát không khí

---

## 2. Mục Tiêu & Phạm Vi

### 2.1 Mục Tiêu

**Chính:**
- Xây dựng hệ thống nhúng có khả năng đo đạc chất lượng không khí độc lập
- Cung cấp điều khiển thiết bị thông minh tự động dựa trên dữ liệu cảm biến
- Đảm bảo hoạt động liên tục ngay cả khi mất kết nối internet

**Phụ:**
- Cung cấp giao diện web để quản lý từ xa (khi có WiFi)
- Hỗ trợ cập nhật firmware không cần kết nối vật lý
- Ghi nhận lịch sử hoạt động trên cloud

### 2.2 Phạm Vi

**Được Bao Gồm:**
- Hệ thống nhúng ESP32 (firmware, bootloader)
- Backend Node.js + Express (API, MQTT, Database)
- Frontend React + Vite (web dashboard)
- Cơ sở dữ liệu MySQL
- Tài liệu hướng dẫn triển khai

**Không Bao Gồm:**
- Phần cứng (bạn cần mua ESP32, sensors, relays, etc.)
- Mobile app (chỉ có web)
- Hosting/server công cộng (hướng dẫn setup local)

---

## 3. Kiến Trúc Hệ Thống

### 3.1 Sơ Đồ Tổng Quan

```
┌─────────────────────────────────────────────────────────────────────┐
│              Hệ Thống Nhúng Giám Sát Chất Lượng Không Khí           │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Chế Độ Offline (Không WiFi) - Hoạt động 100% độc lập    │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │                                                            │    │
│  │  ESP32 Core 1 (Compute)           Phần Cứng              │    │
│  │  ├─ Sensor Task                   ├─ ADS1115 (I2C)       │    │
│  │  │  └─ Đọc ADC                    ├─ LCD 16x2 (I2C)      │    │
│  │  │  └─ Áp dụng filter             ├─ Relay (GPIO)        │    │
│  │  │  └─ Phân loại AQI              ├─ Buzzer (GPIO)       │    │
│  │  │                                ├─ Servo (GPIO)        │    │
│  │  ├─ Control Task                  └─ Button (GPIO)       │    │
│  │  │  └─ Tự động điều khiển quạt                          │    │
│  │  │  └─ Mở/đóng cửa sổ                                   │    │
│  │  │  └─ Bật/tắt buzzer                                   │    │
│  │  │                                                            │    │
│  │  ├─ LCD Task                                                  │    │
│  │  │  └─ Hiển thị trạng thái realtime                          │    │
│  │  │                                                            │    │
│  │  └─ Emergency Task                                            │    │
│  │     └─ Xử lý nút bấm khẩn cấp                                │    │
│  │                                                            │    │
│  │  ✓ Hoạt động 24/7 không cần internet                         │    │
│  │  ✓ LCD hiển thị tình trạng                                  │    │
│  │  ✓ Nút bấm vật lý luôn hoạt động                            │    │
│  │  ✓ RTC memory lưu trạng thái                                │    │
│  │                                                            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Chế Độ Online (Có WiFi + MQTT) - Bổ sung tính năng cloud│    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │                                                            │    │
│  │  ESP32 Core 0 (WiFi)                                         │    │
│  │  ├─ MQTT Task                                                │    │
│  │  │  ├─ Kết nối HiveMQ broker                                │    │
│  │  │  ├─ Publish telemetry (10s)                              │    │
│  │  │  └─ Subscribe commands                                   │    │
│  │  │                                                            │    │
│  │  ├─ OTA Task                                                 │    │
│  │  │  ├─ Download firmware                                    │    │
│  │  │  ├─ Verify MD5                                           │    │
│  │  │  └─ Flash update                                         │    │
│  │  │                                                            │    │
│  │  Backend (Node.js)            Database                         │    │
│  │  ├─ API Server                 └─ MySQL                       │    │
│  │  ├─ MQTT Client Pool              ├─ User data               │    │
│  │  ├─ Socket.io Server              ├─ Device data             │    │
│  │  └─ File Handler                  ├─ Telemetry               │    │
│  │                                    ├─ Activity logs           │    │
│  │                                    └─ Firmware versions       │    │
│  │                                                            │    │
│  │  Frontend (React)                                            │    │
│  │  ├─ Dashboard (monitoring)                                   │    │
│  │  ├─ OTA Management (update)                                  │    │
│  │  └─ Activity Feed (logs)                                     │    │
│  │                                                            │    │
│  │  ✓ Tất cả tính năng offline + cloud features                │    │
│  │  ✓ Web dashboard realtime                                   │    │
│  │  ✓ Remote control từ web                                    │    │
│  │  ✓ OTA firmware updates                                     │    │
│  │                                                            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Luồng Dữ Liệu Chế Độ Offline

```
Sensor ADC (ADS1115, kênh 0, 1)
    ↓
Sensor Task: Đọc giá trị thô
    ↓
EMA Filter: Làm mịn dữ liệu
    ↓
Classify: GOOD (AQI<50) | MOD (50-100) | BAD (100-150) | DANG (>150)
    ↓
Control Task: So sánh với ngưỡng
    ↓
Actuator Execution:
├─ GPIO Relay: Bật/tắt quạt
├─ GPIO Buzzer: Phát cảnh báo
├─ PWM Servo: Điều chỉnh góc cửa
└─ LCD: Hiển thị trạng thái
    ↓
RTC Memory: Lưu trạng thái (tồn tại qua reset)
```

### 3.3 Luồng Dữ Liệu Chế Độ Online

```
Device (offline processing) 
    ↓
MQTT Publish (10 giây): 
  Topic: air/data/{device_id}
  Payload: {mac, rooms[AQI, level], timestamp}
    ↓
HiveMQ Cloud Broker (TLS)
    ↓
Backend MQTT Client:
  - Nhận dữ liệu
  - Parse JSON
  - Validate
    ↓
Database Insert:
  - Telemetry records
  - Activity logs
    ↓
Socket.io Broadcast:
  - Thông báo connected clients
    ↓
Frontend Update:
  - Chart updated
  - Status changed
  - Toast notification
```

---

## 4. Yêu Cầu Hệ Thống

### 4.1 Phần Cứng (Hardware)

**Thiết Bị Chính:**
- ESP32 Development Board (dual-core, 4MB PSRAM)
- Bộ cảm biến MQ (MQ-7, MQ-9) hoặc tương đương
- ADS1115 (ADC 16-bit, kênh I2C)

**Thiết Bị Điều Khiển:**
- 2x Relay Module (220V, 10A) - điều khiển quạt
- 2x SFM-27 Buzzer - cảnh báo
- 2x SG90 Servo Motor - cửa sổ
- 3x Push Button - khẩn cấp

**Display & Communication:**
- LCD 16x2 (I2C backpack, 0x27)
- Module WiFi (built-in ESP32)

**Power Supply:**
- 5V 2A adapter

### 4.2 Phần Mềm (Software)

**Embedded:**
- Arduino IDE / PlatformIO
- ESP32 Board Support Package
- FreeRTOS (bao gồm)

**Backend:**
- Node.js v18+
- npm / yarn
- MySQL 8.0+

**Frontend:**
- npm / yarn
- Trình duyệt hiện đại (Chrome, Firefox, Safari)

### 4.3 Điều Kiện Môi Trường

- Chế độ Standalone: Không cần kết nối
- Chế độ Online: WiFi 802.11n, MQTT Broker (HiveMQ Cloud hoặc local)

---

## 5. Công Nghệ Áp Dụng

### 5.1 Embedded Systems

#### **FreeRTOS (Real-Time Operating System)**

6 tasks độc lập chạy song song:

```
┌─────────────────────────────────────────────┐
│  ESP32 Dual-Core Architecture               │
├─────────────────────────────────────────────┤
│  Core 0 (WiFi)                Core 1 (Main) │
│  └─ WiFi Task (Skipped         └─ 5 tasks   │
│     khi offline)                  ├─ Sensor │
│                                    ├─ Control
│                                    ├─ LCD
│                                    ├─ Emergency
│                                    └─ OTA
│                                       (on-demand)
└─────────────────────────────────────────────┘
```

**Priority Scheduling:**
- Emergency Task: Priority 6 (Cao nhất)
- OTA Task: Priority 5 (Ad-hoc)
- Control Task: Priority 4
- Sensor Task: Priority 3
- LCD Task: Priority 2
- MQTT Task: Priority 1

#### **Synchronization Mechanisms**

**Semaphores (Mutex):**
- `dataMutex`: Bảo vệ mảng `rooms[]` (chia sẻ giữa 4 tasks)
- `i2cMutex`: Bảo vệ I2C bus (ADS1115 + LCD cùng bus)
- `mqttMutex`: Bảo vệ MQTT library (không thread-safe)

**Task Notifications:**
- Đánh thức Emergency Task ngay khi nút bấm được kích
- Thay vì chờ timeout, task thức dậy < 100ms

#### **Interrupt Service Routines (ISR)**

```c
void IRAM_ATTR isrEmergency() {
  // Debounce: 250ms
  if (interrupt_time - last_interrupt_time > 250) {
    flagEmergency = true;
    vTaskNotifyGiveFromISR(emergencyTaskHandle, NULL);
  }
}
```

#### **Data Processing**

**EMA (Exponential Moving Average) Filter:**
```
filtered = α × raw + (1-α) × filtered_prev

α = 0.2 (smoothing factor)
- Giảm noise từ cảm biến
- Phản ứng nhanh với thay đổi thực
- CPU efficient
```

#### **Watchdog Timer (WDT)**

- Tự động reset nếu code hang
- Khôi phục từ RTC backup state
- Đảm bảo system recovery

#### **RTC Backup Memory**

```c
RTC_DATA_ATTR Mode savedMode[2];
RTC_DATA_ATTR bool savedFan[2];
RTC_DATA_ATTR bool savedEmergency[2];
// Tồn tại qua: Software reset, WDT reset
// Mất khi: Deep sleep, power loss (không pin)
```

### 5.2 Backend Architecture

#### **MQTT Protocol**

**Topics:**
- `air/data/{device_id}` - Device publish telemetry
- `air/updatefirmware` - Backend send OTA command
- `air/firmwareupdatestatus` - Device report OTA result

**Payload Format (Telemetry):**
```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "rooms": [
    {
      "index": 0,
      "raw_aqi": 145,
      "level": "MOD",
      "fan_on": true,
      "window_angle": 90
    },
    {
      "index": 1,
      "raw_aqi": 89,
      "level": "GOOD",
      "fan_on": false,
      "window_angle": 0
    }
  ],
  "timestamp": "2026-06-17T10:30:00Z",
  "fw_version": "1.0.1"
}
```

#### **REST API Endpoints**

```
POST   /api/auth/register           - User registration
POST   /api/auth/login              - User login
POST   /api/auth/logout             - User logout

GET    /api/devices                 - List user devices
POST   /api/devices/claim           - Claim device via PIN
GET    /api/devices/:id/status      - Get device status

GET    /api/telemetry/latest        - Latest sensor data
GET    /api/telemetry/history       - Historical data

GET    /api/activity/logs           - Activity logs

POST   /api/firmware/upload         - Upload firmware
GET    /api/firmware/list           - List firmwares
GET    /api/firmware/download/:ver  - Download firmware
POST   /api/firmware/trigger        - Trigger OTA update
GET    /api/firmware/status         - OTA status
```

#### **Database Schema**

```sql
Users
├─ user_id (PK)
├─ email
├─ password_hash
└─ created_at

Devices
├─ device_id (PK)
├─ mac_address (UNIQUE)
├─ device_name
├─ status (ONLINE/OFFLINE)
├─ firmware_version
└─ created_at

Rooms
├─ room_id (PK)
├─ device_id (FK)
├─ room_index
├─ room_name
├─ current_mode (AUTO/MANUAL)
└─ created_at

TelemetryData
├─ id (PK)
├─ room_id (FK)
├─ aqi_raw
├─ aqi_level
├─ fan_status
├─ timestamp (indexed)
└─ INDEX(room_id, timestamp)

FirmwareUpdateLog
├─ id (PK)
├─ device_id (FK)
├─ firmware_version (FK)
├─ status (pending/in_progress/success/failed)
├─ started_at
├─ completed_at
└─ error_message
```

#### **Authentication & Security**

- **JWT (JSON Web Tokens)**:
  - Signed with HS256
  - TTL: 24 hours
  - Refresh token mechanism

- **Password Hashing**:
  - bcryptjs, salt rounds ≥ 10
  - Never stored in plaintext

- **MQTT Security**:
  - TLS 1.2+ (port 8883)
  - Username/password auth
  - Certificate validation

### 5.3 Frontend Architecture

#### **State Management (Zustand)**

```javascript
useAuthStore
├─ token
├─ user
├─ login()
├─ logout()
└─ setToken()

useDeviceStore
├─ devices[]
├─ currentDevice
├─ rooms[]
├─ addDevice()
├─ updateRoom()
└─ syncWithSocket()
```

#### **Real-Time Updates (Socket.io)**

```javascript
Events:
- connection           : Client connected
- device:update        : Device status changed
- telemetry:new        : New sensor data
- firmware:progress    : OTA update progress
- activity:log         : Activity logged
```

#### **UI Components**

```
App
├─ Router
│  ├─ /login         → LoginPage
│  ├─ /dashboard     → DashboardPage
│  │  ├─ Navbar
│  │  ├─ Sidebar (device list)
│  │  ├─ RoomCard[] (per-room monitoring)
│  │  └─ ActivityFeed
│  └─ /ota           → OTAManagement
│     ├─ FirmwareUpload
│     ├─ TriggerUpdate
│     └─ UpdateStatus
```

---

## 6. Stack Kỹ Thuật

### 6.1 Backend

| Công Nghệ | Phiên Bản | Mục Đích |
|-----------|----------|---------|
| Node.js | v18+ | JavaScript runtime |
| Express.js | 5.2.1 | Web framework |
| Prisma | 6.19.3 | ORM & migrations |
| MySQL | 8.0+ | Database |
| MQTT | 5.15.1 | IoT messaging |
| Socket.io | 4.8.3 | Real-time communication |
| JWT | 9.0.3 | Authentication |
| bcryptjs | 3.0.3 | Password hashing |

### 6.2 Frontend

| Công Nghệ | Phiên Bản | Mục Đích |
|-----------|----------|---------|
| React | 19.2.5 | UI library |
| Vite | 5.4.10 | Build tool |
| React Router | 7.14.1 | Routing |
| Zustand | 5.0.12 | State management |
| Axios | 1.15.1 | HTTP client |
| Tailwind CSS | 4.2.3 | Styling |
| Socket.io-client | 4.8.3 | Real-time |
| Recharts | 3.8.1 | Charts |

### 6.3 Embedded

| Công Nghệ | Mục Đích |
|-----------|---------|
| Arduino IDE / PlatformIO | Development |
| FreeRTOS | Real-time OS |
| WiFi 802.11n | Networking |
| MQTT Protocol | Device communication |
| I2C Protocol | ADS1115 & LCD |
| OTA Bootloader | Firmware updates |
| PWM | Servo control |

---

## 7. Triển Khai Hệ Thống

### 7.1 Bước 1: Chuẩn Bị Phần Cứng

```bash
# Danh sách linh kiện
- ESP32 Dev Board
- ADS1115 (I2C ADC)
- LCD 16x2 (I2C)
- 2x Relay Module
- 2x Buzzer
- 2x Servo Motor
- 3x Push Button
- Dây jumper, resistor

# Kết Nối I2C:
SDA (GPIO 21) → ADS1115 SDA
SCL (GPIO 22) → ADS1115 SCL
SDA → LCD SDA
SCL → LCD SCL

# Kết Nối GPIO:
GPIO 32, 33 → Relay 1, 2 (Fan)
GPIO 25, 4  → Buzzer 1, 2
GPIO 26, 27 → Servo 1, 2
GPIO 34, 35, 23 → Button 1, 2, All (Emergency)
```

### 7.2 Bước 2: Cấu Hình & Upload Arduino

```bash
# 1. Cài Arduino IDE
# https://www.arduino.cc/en/software

# 2. Cài ESP32 Board Support

# 3. Cài thư viện:
# - WiFi.h (built-in)
# - PubSubClient (MQTT)
# - ArduinoJson
# - Adafruit_ADS1X15
# - LiquidCrystal_I2C
# - ESP32Servo

# 4. Edit Arduino/newestVersion.ino:
#define WIFI_SSID "your-wifi"
#define WIFI_PASSWORD "your-password"
#define MQTT_SERVER "your-broker"
#define MQTT_PORT 8883
#define MQTT_USERNAME "your-username"
#define MQTT_PASSWORD "your-password"

# 5. Upload to device
# Tools → Board → ESP32 Dev Module
# Sketch → Upload
```

### 7.3 Bước 3: Cấu Hình Backend

```bash
cd Backend

# 1. Cài dependencies
npm install

# 2. Tạo .env
cat > .env << EOF
PORT=5000
NODE_ENV=development
DATABASE_URL=mysql://root:root@localhost:3306/air_quality_db
JWT_SECRET=your-secret-key-change-in-production
MQTT_BROKER=your-broker.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=your-username
MQTT_PASSWORD=your-password
MQTT_USE_TLS=true
EOF

# 3. Setup database
npx prisma migrate deploy

# 4. Chạy server
npm run dev
# Server runs on http://localhost:5000
```

### 7.4 Bước 4: Cấu Hình Frontend

```bash
cd Frontend

# 1. Cài dependencies
npm install

# 2. Chạy dev server
npm run dev
# Frontend runs on http://localhost:5173

# 3. Build for production
npm run build
# Output: dist/
```

### 7.5 Bước 5: Kiểm Tra Kết Nối

```bash
# 1. Kiểm tra ESP32 kết nối WiFi
# - Xem Serial Monitor (9600 baud)
# - Tìm "[WiFi] Connected to SSID"

# 2. Kiểm tra MQTT kết nối
# - Backend logs: "[MQTT] Client connected"
# - Serial: "[MQTT] Publishing to air/data/..."

# 3. Kiểm tra Backend API
curl http://localhost:5000/health
# Response: {"status":"OK","timestamp":"..."}

# 4. Kiểm tra Frontend
# Mở http://localhost:5173
# Đăng nhập, xem dashboard
```

---

## 8. Hướng Dẫn Sử Dụng

### 8.1 Chế Độ Offline (Không Cần WiFi)

**Thiết Lập Ban Đầu:**
1. Upload code Arduino lên ESP32
2. Kết nối phần cứng (sensor, relay, servo)
3. Cấp nguồn 5V

**Hoạt Động Tự Động:**
- Device tự động đọc cảm biến
- Phân loại chất lượng không khí (GOOD/MOD/BAD/DANG)
- Tự động bật/tắt quạt dựa trên AQI (chế độ AUTO)
- Mở/đóng cửa sổ tự động
- LCD hiển thị trạng thái realtime
- Nút bấm khẩn cấp luôn hoạt động

**LCD Display:**
```
Line 1: R1: MOD [Fan:ON ]
Line 2: R2: GOOD[Fan:OFF]

MOD = AQI 50-100 (Trung bình)
Fan:ON = Quạt bật
Window:90° = Cửa mở 90 độ
```

**Nút Bấm:**
- Button Room 1 (GPIO 34): Khẩn cấp phòng 1
- Button Room 2 (GPIO 35): Khẩn cấp phòng 2
- Button All (GPIO 23): Khẩn cấp toàn bộ

Khi bấm → Buzzer reo + Cửa đóng + Quạt bật

### 8.2 Chế Độ Online (Có WiFi + MQTT)

**Kết Nối WiFi:**
```cpp
WIFI_SSID "Your-Network"
WIFI_PASSWORD "Your-Password"
```

**Kết Nối MQTT:**
- Broker: HiveMQ Cloud hoặc local Mosquitto
- Port: 8883 (TLS)
- Topics:
  - Publish: `air/data/{device_id}`
  - Subscribe: `air/updatefirmware`

**Web Dashboard:**
1. Mở http://localhost:5173
2. Đăng nhập tài khoản
3. Thêm device (Claim via PIN)
4. Xem monitoring realtime
5. Remote control (bật/tắt, điều khiển mode)
6. Xem lịch sử data

**OTA Firmware Update:**
1. Chuẩn bị file `.bin` (compile từ Arduino IDE)
2. Tải lên OTA Management page
3. Chọn device target
4. Click "Send OTA Update"
5. Device tự động download, verify, flash
6. Device tự động restart
7. Xem status update trong dashboard

### 8.3 Điều Khiển Chế Độ

**Chế Độ AUTO:**
- Device tự động điều khiển dựa trên AQI
- Không cần tương tác
- Được khôi phục từ RTC khi reset

**Chế Độ MANUAL:**
- Điều khiển từ nút bấm vật lý
- Hoặc remote control từ web (khi online)
- Cần mỗi lần thay đổi

---

## 9. Tài Liệu Tham Khảo

### 9.1 Tài Liệu Trong Dự Án

```
/doc/
├─ BACKEND-SETUP-GUIDE.md
│  └─ Chi tiết cài đặt backend
├─ BACKEND-SYSTEM-DESIGN.md
│  └─ Kiến trúc backend, API, database
├─ EMBEDDED-FIRMWARE-ANALYSIS.md
│  └─ Chi tiết firmware ESP32, FreeRTOS
├─ OTA-IMPLEMENTATION-GUIDE.md
│  └─ Hướng dẫn OTA update
└─ FIRMWARE-OTA-UPDATE-GUIDE.md
   └─ MQTT payload format

/
├─ README.md (chuẩn)
├─ Arduino/newestVersion.ino
├─ Backend/ (Express.js API)
├─ Frontend/ (React Dashboard)
└─ doc/
```

### 9.2 Tài Liệu Ngoài

- **FreeRTOS**: https://www.freertos.org/
- **ESP32 Datasheet**: https://www.espressif.com/
- **MQTT 3.1.1**: https://mqtt.org/
- **HiveMQ**: https://www.hivemq.com/
- **Node.js**: https://nodejs.org/
- **Prisma ORM**: https://www.prisma.io/

### 9.3 Troubleshooting

**Device không kết nối WiFi:**
- Kiểm tra SSID/password
- Xem Serial Monitor 9600 baud
- Tìm "[WiFi] Connection failed"

**MQTT không kết nối:**
- Kiểm tra broker URL/port
- Kiểm tra username/password
- Kiểm tra firewall

**Backend không nhận dữ liệu:**
- Kiểm tra database connection
- Xem backend logs
- Kiểm tra MQTT topic

**OTA update thất bại:**
- Kiểm tra file .bin size
- Verify MD5 hash
- Xem device logs

---

## 10. Kết Luận

### 10.1 Tóm Tắt

Dự án này cung cấp một **hệ thống nhúng hoàn chỉnh** cho phép:
- ✅ Giám sát chất lượng không khí độc lập (offline-first)
- ✅ Điều khiển thiết bị tự động dựa trên dữ liệu cảm biến
- ✅ Quản lý từ xa thông qua web khi có kết nối
- ✅ Cập nhật firmware không cần USB
- ✅ Ghi nhận lịch sử data trên cloud

### 10.2 Điểm Mạnh

1. **Tự Động Độc Lập**: Hoạt động 100% mà không cần internet
2. **Reliable**: FreeRTOS, WDT, RTC backup đảm bảo uptime cao
3. **Scalable**: Hỗ trợ nhiều phòng, nhiều device
4. **Secure**: JWT auth, encrypted MQTT, password hashing
5. **Cloud-Ready**: Optional cloud integration
6. **Developer-Friendly**: Tài liệu chi tiết, code comments

### 10.3 Hướng Phát Triển Tiếp

- [ ] Mobile app (iOS/Android)
- [ ] Multi-language support
- [ ] Scheduling (bật quạt theo thời gian)
- [ ] Machine learning (dự đoán AQI)
- [ ] Data export (CSV/Excel)
- [ ] Advanced analytics dashboard

---

**Phiên Bản**: 1.0.0  
**Ngày Cập Nhật**: 2026-06-17  
**Trạng Thái**: Production Ready ✅

# Phân Tích Chi Tiết Firmware ESP32 - Hệ Thống Quản Lý Chất Lượng Không Khí IoT

## 📋 Mục Lục
1. [Tổng Quan Kiến Trúc](#tổng-quan-kiến-trúc)
2. [Kỹ Thuật Xử Lý Áp Dụng](#kỹ-thuật-xử-lý-áp-dụng)
3. [Chi Tiết Các Module](#chi-tiết-các-module)
4. [Luồng Xử Lý Chính](#luồng-xử-lý-chính)
5. [Phân Tích Từng Task](#phân-tích-từng-task)
6. [Xử Lý Dữ Liệu](#xử-lý-dữ-liệu)
7. [Cơ Chế An Toàn](#cơ-chế-an-toàn)

---

## Tổng Quan Kiến Trúc

### 1. Mô Hình RTOS (Real-Time Operating System)

Firmware sử dụng **FreeRTOS** trên ESP32 để quản lý 6 task độc lập chạy song song:

```
┌─────────────────────────────────────────────────────────────┐
│                    ESP32 Dual-Core                          │
├──────────────────────────┬──────────────────────────────────┤
│      Core 0 (UART)       │      Core 1 (Compute)            │
│                          │                                  │
│  • MQTT Task (Prio 1)    │  • Emergency Task (Prio 6) ◄─┐  │
│  • LCD Task (Prio 2)     │  • Control Task (Prio 4)      │  │
│                          │  • Sensor Task (Prio 3)       │  │
│                          │  • OTA Task (Prio 5) [Ad-hoc] │  │
│                          │                                │  │
│                          └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
        │                                     │
        ▼ (I2C/MQTT)                         ▼ (ISR)
    HiveMQ Cloud                        Button Interrupts
    WiFi 802.11n
```

### 2. Cấu Hình Phần Cứng

**Input (Nguồn dữ liệu):**
- ADS1115: 2 kênh ADC 16-bit (0, 1) → Cảm biến gas MQ
- 3 Nút bấm: GPIO 34, 35, 23 → Khẩn cấp (Interrupt)
- WiFi: MQTT client subscribe

**Output (Điều khiển):**
- GPIO 32, 33: Relay điều khiển quạt (2 phòng)
- GPIO 25, 4: Buzzer cảnh báo (2 phòng)
- GPIO 26, 27: Servo điều khiển cửa sổ (2 phòng)
- I2C: LCD hiển thị trạng thái

### 3. Mô Hình Dữ Liệu

```c
struct Room {
  // Cảm biến
  int raw;                  // Giá trị ADC thô
  float filtered;           // Giá trị đã lọc (EMA)
  bool error;               // Lỗi cảm biến
  const char* level;        // Mức: GOOD/MOD/BAD/DANG
  
  // Trạng thái mục tiêu (từ điều khiển)
  bool targetFan;           // Quạt mục tiêu
  bool targetBuzzer;        // Còi mục tiêu
  int targetWindowAngle;    // Góc cửa mục tiêu
  
  // Trạng thái hiện tại (phần cứng)
  bool currentFan;
  bool currentBuzzer;
  int currentWindowAngle;
  
  // Chế độ và bảo mật
  Mode mode;                // AUTO hoặc MANUAL
  bool isEmergency;         // Cờ khẩn cấp (bằng nút bấm)
};

Room rooms[ROOM_COUNT];  // ROOM_COUNT = 2
```

---

## Kỹ Thuật Xử Lý Áp Dụng

### 1. **Đa Luồng & Synchronization (FreeRTOS)**

#### 1.1 Semaphores (Bảo vệ Dữ liệu Chia Sẻ)

```c
SemaphoreHandle_t dataMutex;    // Bảo vệ mảng rooms[]
SemaphoreHandle_t i2cMutex;     // Bảo vệ bus I2C chung (ADS1115 + LCD)
SemaphoreHandle_t mqttMutex;    // Bảo vệ thư viện MQTT (không thread-safe)
```

**Cơ Chế:** Khi task cần truy cập tài nguyên chia sẻ:
```c
if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
  // Vào critical section (chỉ 1 task được vào cùng lúc)
  rooms[i].raw = newValue;
  xSemaphoreGive(dataMutex); // Nhả mutex cho task khác
}
```

**Tại sao cần:**
- ADS1115, LCD cùng I2C → Tranh chấp bus
- rooms[] được truy cập từ 4 task → Race condition
- MQTT library không thread-safe

#### 1.2 Task Notification (Đánh Thức Task)

```c
// Task A (Sensor) phát hiện nguy hiểm
xTaskNotifyGive(controlTaskHandle);  // Đánh thức Task B

// Task B (Control) chờ ngắt
ulTaskNotifyTake(pdTRUE, 1500 / portTICK_PERIOD_MS);
// Nếu nhận notification thì thức dậy ngay, không chờ timeout
```

**Lợi ích:** Nhanh hơn delay - task có thể thức dậy trước khi timeout nếu có sự kiện quan trọng.

### 2. **Xử Lý Interrupt & Debounce**

#### 2.1 Button Interrupt (Khẩn Cấp)

```c
void IRAM_ATTR isrR1() {  // Chạy trên RAM tốc độ cao
  unsigned long interrupt_time = millis();
  
  // Debounce: Chỉ xử lý nếu > 250ms từ ngắt cuối
  if (interrupt_time - last_interrupt_time > DEBOUNCE_TIME) {
    flagTriggerR1 = true;  // Set cờ (không xử lý nhiều công việc trong ISR)
    
    // Đánh thức Emergency Task nếu tồn tại
    if(emergencyTaskHandle) 
      vTaskNotifyGiveFromISR(emergencyTaskHandle, NULL);
    
    last_interrupt_time = interrupt_time;
  }
}
```

**Lý do Debounce:**
- Button điện cơ khi bấm sẽ "dội" (bounce) gây nhiều ngắt
- 250ms là khoảng thời gian đủ để button ổn định
- Phòng tránh kích hoạt khẩn cấp nhiều lần từ 1 lần bấm

**Nguyên Tắc ISR:**
- Phải `IRAM_ATTR` để chạy nhanh (RAM tốc độ cao)
- Chỉ set flag, không xử lý công việc nặng
- Gọi `vTaskNotifyGiveFromISR` (phiên bản interrupt-safe)

#### 2.2 Kiểm Tra OTA Trong ISR

```c
if (interrupt_time - last_interrupt_time > DEBOUNCE_TIME && !isUpdatingFirmware) {
    // Nếu đang OTA thì bỏ qua interrupt nút bấm
    // Lý do: Không muốn bấm nút làm OTA bị gián đoạn
}
```

### 3. **Lọc Dữ Liệu (Exponential Moving Average)**

```c
float alpha = 0.2;  // Hệ số lọc
// Công thức: filtered[t] = α × raw[t] + (1-α) × filtered[t-1]
rooms[i].filtered = alpha * rawValues[i] + (1 - alpha) * rooms[i].filtered;
rooms[i].raw = (int)rooms[i].filtered;
```

**Tác Dụng:**
- Loại bỏ nhiễu từ cảm biến gas MQ
- α = 0.2 → 20% từ dữ liệu mới, 80% từ quá khứ
- Tạo đường cong mượt mà thay vì nhảy cóc

**Công thức Toán Học:**
```
EMA[t] = α × X[t] + (1-α) × EMA[t-1]

Ví dụ: α = 0.2
- Lần 1: EMA = 0.2 × 1000 + 0.8 × 0 = 200
- Lần 2: EMA = 0.2 × 950 + 0.8 × 200 = 350
- Lần 3: EMA = 0.2 × 1050 + 0.8 × 350 = 490
```

### 4. **Mapping ADC (Chuyển Đổi Giá Trị)**

```c
int16_t adc_val = ads.readADC_SingleEnded(adsChannels[i]);  // 0-26666 (16-bit ADS1115)
rawValues[i] = map(adc_val, 0, 26666, 0, 4095);  // Chuyển về 12-bit (0-4095)
```

**Tại Sao Chuyển Đổi:**
- ADS1115 trả về 16-bit (0-26666 tại 5V)
- Code cũ logic dùng 12-bit (0-4095)
- Mapping giữ nguyên hành vi logic cũ

**Công thức:**
```
new_value = (old_value - old_min) × (new_max - new_min) / (old_max - old_min) + new_min
         = adc_val × 4095 / 26666
```

### 5. **RTC Backup Memory (Khôi Phục Sau Reset)**

```c
RTC_DATA_ATTR Mode savedMode[ROOM_COUNT];       // Chế độ cuối
RTC_DATA_ATTR bool savedFan[ROOM_COUNT];         // Trạng thái quạt
RTC_DATA_ATTR bool savedBuzzer[ROOM_COUNT];      // Trạng thái còi
RTC_DATA_ATTR int savedWindowAngle[ROOM_COUNT];  // Góc cửa
RTC_DATA_ATTR bool savedEmergency[ROOM_COUNT];   // Trạng thái khẩn cấp
RTC_DATA_ATTR bool wasResetByWDT = false;        // Cờ reset
```

**Lợi Ích:**
- RTC = Real Time Clock (bộ nhớ không bị xóa khi reset)
- Sau khi WDT reset, khôi phục trạng thái cũ
- Quạt, Buzzer, Servo không bị reset về 0

**Luồng Khôi Phục:**
```c
if (wasResetByWDT) {
  rooms[i].mode = savedMode[i];
  rooms[i].targetBuzzer = rooms[i].currentBuzzer = savedBuzzer[i];
  // ... v.v ...
}
```

### 6. **Watchdog Timer (WDT) - Tự Động Reset**

```c
esp_task_wdt_config_t wdt_config = {
    .timeout_ms = 30000,  // 30 giây timeout
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
};
esp_task_wdt_init(&wdt_config);

// Mỗi task phải đăng ký và báo cáo
esp_task_wdt_add(NULL);      // Đăng ký task hiện tại
esp_task_wdt_reset();        // Báo cáo còn sống (trong vòng lặp)
```

**Nguyên Lý:**
- Nếu task không gọi `esp_task_wdt_reset()` trong 30 giây → WDT reset toàn bộ hệ thống
- Phòng tránh task "treo" (stuck in infinite loop)
- Tự động phục hồi hệ thống

**Phát Hiện Reset:**
```c
esp_reset_reason_t resetReason = esp_reset_reason();
if (resetReason == ESP_RST_TASK_WDT || ...) {
  wasResetByWDT = true;  // Khôi phục state từ RTC
}
```

### 7. **Cấp Độ Ưu Tiên Task (Priority Levels)**

```
Độ ưu tiên từ cao đến thấp:
Priority 6: Emergency Task    ◄─ Nút bấm khẩn cấp (phản ứng ngay)
Priority 5: OTA Task          ◄─ Cập nhật firmware (khi được gọi)
Priority 4: Control Task      ◄─ Não bộ điều khiển logic chính
Priority 3: Sensor Task       ◄─ Đọc cảm biến
Priority 2: LCD Task          ◄─ Hiển thị LCD (không cấp thiết)
Priority 1: MQTT Task         ◄─ Truyền thông (không cấp thiết)
```

**Lý Do Cấp Độ Này:**
- **Khẩn cấp** (6): Nút bấm phải phản ứng ngay, không chờ
- **Cập nhật** (5): OTA cần độ ưu tiên cao khi được kích hoạt
- **Điều khiển** (4): Logic chính, kích hoạt từ Sensor
- **Cảm biến** (3): Cần nhanh nhưng có thể chờ 1 giây
- **LCD** (2): Cập nhật mỗi 2 giây, không cấp thiết
- **MQTT** (1): Gửi mỗi 3 giây, ít ảnh hưởng hệ thống

### 8. **Non-Blocking MQTT Connection**

```c
void handleMqtt() {
  if (!client.connected()) {
    if (millis() - lastMqttRetry > 5000) {  // Thử lại mỗi 5 giây
      lastMqttRetry = millis();
      if (client.connect(...)) {
        client.subscribe("air/control");
        client.subscribe("air/updatefirmware");
      }
    }
  } else {
    client.loop();  // Xử lý incoming messages
  }
}
```

**Tại Sao Non-Blocking:**
- `connect()` có thể mất 3-5 giây nếu broker không sẵn
- Nếu block, LCD và Sensor sẽ bị treo
- Thay vào đó, chỉ thử lại mỗi 5 giây

---

## Chi Tiết Các Module

### 1. **Module Cảm Biến (ADS1115 ADC)**

#### Hardware Connection:
```
ADS1115 (I2C)
├── VDD → 5V
├── GND → GND
├── SCL (GPIO 22)
├── SDA (GPIO 21)
└── A0, A1 → Cảm biến gas MQ-9
    └── Kênh 0: Phòng 1
    └── Kênh 1: Phòng 2
```

#### Đặc Tính:
- 16-bit ADC (so với ESP32 12-bit)
- Độ chính xác cao, ít nhiễu
- Giao tiếp I2C Address: 0x48 (mặc định)

#### Mapping Giá Trị:
```
ADS1115 Output → Room Level Classification

Raw Value    Level    Mức Độ
0-1200       GOOD     ✅ Tốt (Quạt tắt)
1200-2000    MOD      ⚠️  Trung bình (Quạt bật)
2000-3000    BAD      🔴 Xấu (Quạt + Buzzer)
3000+        DANG     🚨 Nguy hiểm (Full + Khẩn cấp)

const char* getLevel(int v) {
  if (v < 1200) return "GOOD";
  if (v < 2000) return "MOD ";
  if (v < 3000) return "BAD ";
  return "DANG";
}
```

### 2. **Module Điều Khiển Phần Cứng**

#### Relay (Quạt):
```c
void executeFan(int i) {
  if (rooms[i].currentFan != rooms[i].targetFan) {
    digitalWrite(relayPins[i], rooms[i].targetFan ? HIGH : LOW);
    rooms[i].currentFan = rooms[i].targetFan;
    Serial.printf("[ACTION] Quạt R%d: %s\n", i+1, rooms[i].currentFan ? "ON" : "OFF");
    flagResetI2C = true;  // Báo LCD reset i2c vì relay tạo nhiễu EMI
  }
}
```

**Tại Sao Set flagResetI2C:**
- Relay là thiết bị cơ điện tạo EMI (nhiễu từ) khi đóng/mở
- I2C rất nhạy cảm với nhiễu → Lỗi giao tiếp
- Bằng cách reset I2C trong LCD Task, đảm bảo ổn định

#### Servo (Cửa Sổ):
```c
void executeWindow(int i) {
  int tAngle = rooms[i].targetWindowAngle;
  if (tAngle < 0) tAngle = 0;
  if (tAngle > 180) tAngle = 180;
  
  if (abs(rooms[i].currentWindowAngle - tAngle) > 2) {
    // Chỉ ghi servo nếu khác > 2 độ (chống rung động)
    windowServos[i].write(tAngle);
    rooms[i].currentWindowAngle = tAngle;
  }
}
```

**Hysteresis (2 độ):** Tránh ghi servo liên tục nếu giá trị dao động nhẹ.

#### Buzzer (Cảnh báo):
```c
void executeBuzzer(int i) {
  if (rooms[i].currentBuzzer != rooms[i].targetBuzzer) {
    digitalWrite(buzzerPins[i], rooms[i].targetBuzzer ? HIGH : LOW);
    rooms[i].currentBuzzer = rooms[i].targetBuzzer;
  }
}
```

### 3. **Module MQTT Communication**

#### Topics Subscribe:
```
1. air/control
   Payload: {
     "room": 1-2,
     "mode": "AUTO" | "MANUAL",
     "fan": true | false,
     "buzzer": true | false,
     "window": 0-180
   }
   
2. air/updatefirmware
   Payload: {
     "url": "http://server/firmware/v1.0.3.bin",
     "version": "1.0.3"
   }
```

#### Topics Publish:
```
1. air/data (mỗi 3 giây)
   Payload: {
     "rooms": [
       {
         "id": 1,
         "value": 1500,
         "level": "MOD",
         "mode": "AUTO",
         "fan": true,
         "buzzer": false,
         "window": 90,
         "emergency": false
       },
       ...
     ]
   }

2. air/firmwareupdatestatus (sau OTA)
   Payload: {
     "mac_address": "FA:KE:21:B6:9E:30",
     "status": "success" | "failed",
     "version": "1.0.3",
     "error": null | "error message"
   }
```

---

## Luồng Xử Lý Chính

### Luồng 1: Khởi Động (Boot Sequence)

```
1. setup() → Khởi tạo phần cứng
   ├─ UART (115200 bps)
   ├─ Semaphore x3 (dataMutex, i2cMutex, mqttMutex)
   ├─ GPIO: Relay, Buzzer, Servo
   ├─ I2C: LCD + ADS1115
   ├─ WiFi connect
   ├─ MQTT connect
   ├─ Interrupt pins (Nút bấm khẩn cấp)
   └─ WDT config (30 giây timeout)

2. Kiểm tra Reset Reason
   ├─ Nếu WDT reset → Khôi phục từ RTC backup
   └─ Nếu power-up → Reset toàn bộ về trạng thái mặc định

3. Tạo 5 FreeRTOS Tasks:
   ├─ taskEmergency (Priority 6)
   ├─ taskControl (Priority 4)
   ├─ taskSensor (Priority 3)
   ├─ taskLCD (Priority 2)
   └─ taskMQTT (Priority 1)

4. loop() → Chỉ báo cáo WDT (task chính)
   └─ Tất cả xử lý chạy trong 5 tasks
```

### Luồng 2: Cảm Biến Đọc Dữ Liệu (Normal Operation)

```
taskSensor (Tất cả 1 giây)
    │
    ├─ Lấy i2cMutex (đọc ADC)
    │   ├─ Đọc ADS1115 kênh 0 & 1
    │   ├─ Map về 12-bit (0-4095)
    │   └─ Nhả i2cMutex
    │
    ├─ Lấy dataMutex
    │   ├─ Lọc dữ liệu (EMA với α=0.2)
    │   ├─ Xác định mức (GOOD/MOD/BAD/DANG)
    │   ├─ Kiểm tra lỗi (ngoài MQ_MIN-MQ_MAX)
    │   └─ Nhả dataMutex
    │
    ├─ Nếu phát hiện "DANG" (mức nguy hiểm)
    │   └─ Gửi xTaskNotifyGive(controlTaskHandle)
    │       → Đánh thức Control để xử lý ngay
    │
    └─ vTaskDelay(1000ms) → Chờ giây tiếp theo
```

### Luồng 3: Xử Lý Logic Điều Khiển (Brain)

```
taskControl (Chờ notification hoặc 1.5 giây)
    │
    ├─ WDT reset (báo cáo còn sống)
    │
    ├─ Nếu OTA: Skip và vTaskDelay(1000ms)
    │
    ├─ Nếu có thông báo từ Sensor/Emergency/Control → Thức dậy
    │
    ├─ Lấy dataMutex
    │   │
    │   └─ FOR i = 0 to 1:
    │       │
    │       ├─ NẾU isEmergency (nút bấm khẩn cấp):
    │       │   ├─ targetBuzzer = true
    │       │   ├─ targetFan = true
    │       │   └─ targetWindowAngle = 180°
    │       │
    │       ├─ NẾU level == "DANG" và mode == AUTO:
    │       │   ├─ Ép mode thành MANUAL
    │       │   ├─ targetBuzzer = true
    │       │   ├─ targetFan = true
    │       │   └─ targetWindowAngle = 180°
    │       │
    │       └─ NẾU mode == AUTO:
    │           ├─ targetBuzzer = false
    │           ├─ targetFan = (level == "BAD ") ? true : false
    │           └─ targetWindowAngle = map(raw, 400, 3000, 0, 180)
    │
    ├─ Thực thi phần cứng:
    │   ├─ executeBuzzer(i)
    │   ├─ executeFan(i)
    │   └─ executeWindow(i)
    │
    ├─ Backup trạng thái vào RTC memory
    │
    ├─ Nhả dataMutex
    │
    └─ ulTaskNotifyTake(1500ms timeout)
        → Chờ notification tiếp theo
```

### Luộng 4: Xử Lý Nút Bấm Khẩn Cấp (Interrupt)

```
Button Press → ISR (ngắt điện)
    │
    ├─ IRAM_ATTR isrR1/isrR2/isrAll() [Chạy tức thì]
    │   │
    │   ├─ Debounce check: Nếu < 250ms → Bỏ qua
    │   ├─ Nếu đang OTA → Bỏ qua
    │   │
    │   ├─ Set cờ (flagTriggerR1, flagTriggerR2, hoặc flagTriggerAll)
    │   ├─ vTaskNotifyGiveFromISR(emergencyTaskHandle)
    │   │   → Đánh thức Emergency Task từ ISR
    │   │
    │   └─ Update timestamp debounce
    │
    └─ Return → Tiếp tục ISR

taskEmergency (Priority 6 - Cao nhất)
    │
    ├─ ulTaskNotifyTake(portMAX_DELAY) → Chờ ISR đánh thức
    │
    ├─ Kiểm tra OTA: Nếu đang OTA → Skip
    │
    ├─ Lấy dataMutex (ngắn 100ms để phản ứng nhanh)
    │   │
    │   ├─ NẾU flagTriggerR1:
    │   │   ├─ isEmergency[0] = !isEmergency[0]  (Toggle)
    │   │   ├─ Nếu OFF → mode = AUTO
    │   │   └─ Log "EMERGENCY R1 ON/OFF"
    │   │
    │   ├─ NẾU flagTriggerR2:
    │   │   ├─ isEmergency[1] = !isEmergency[1]  (Toggle)
    │   │   ├─ Nếu OFF → mode = AUTO
    │   │   └─ Log "EMERGENCY R2 ON/OFF"
    │   │
    │   ├─ NẾU flagTriggerAll:
    │   │   ├─ newState = (!isEmergency[0] || !isEmergency[1])
    │   │   ├─ isEmergency[0,1] = newState
    │   │   └─ Log "EMERGENCY ALL ON/OFF"
    │   │
    │   └─ Nhả dataMutex
    │
    ├─ Gởi xTaskNotifyGive(controlTaskHandle) → Control xử lý ngay
    ├─ vTaskDelay(50ms) → Cho phần cứng ổn định
    │
    └─ Quay lại chờ ISR
```

### Luồng 5: Cập Nhật Firmware OTA

```
MQTT Callback nhận "air/updatefirmware"
    │
    ├─ Parse JSON: lấy URL + version
    │
    ├─ Kiểm tra An Toàn:
    │   └─ Lấy dataMutex
    │       ├─ Nếu rooms[0,1].isEmergency == true
    │       │   └─ Từ chối OTA, gửi báo lỗi về server
    │       └─ Nhả dataMutex
    │
    ├─ Tạo Task mới: taskOTA (Priority 5, 8KB stack)
    │   │
    │   └─ TASK OTA:
    │       │
    │       ├─ Bước 1: Thiết lập phần cứng an toàn
    │       │   ├─ Set isUpdatingFirmware = true
    │       │   │  → Tất cả task khác detect và nhường CPU
    │       │   │
    │       │   ├─ vTaskDelay(2000ms)
    │       │   │  → Đợi task khác nhả Mutex và vào yield state
    │       │   │
    │       │   ├─ Tắt tất cả Relay & Buzzer an toàn
    │       │   │  ├─ digitalWrite(relayPins[i], LOW)
    │       │   │  └─ digitalWrite(buzzerPins[i], LOW)
    │       │   │
    │       │   └─ Log "[OTA] Hardware safeguard enabled"
    │       │
    │       ├─ Bước 2: Kiểm tra WiFi
    │       │   └─ Nếu WiFi.status() != WL_CONNECTED
    │       │       └─ Báo lỗi & cancel OTA
    │       │
    │       ├─ Bước 3: Hỗ trợ HTTPS/HTTP linh hoạt
    │       │   ├─ Nếu URL.startsWith("https")
    │       │   │   ├─ secureClient.setInsecure()
    │       │   │   └─ http.begin(secureClient, url)
    │       │   └─ Nếu HTTP
    │       │       └─ http.begin(normalClient, url)
    │       │
    │       ├─ Bước 4: Tải và ghi Flash
    │       │   │
    │       │   ├─ httpCode = http.GET()
    │       │   ├─ contentLength = http.getSize()
    │       │   │
    │       │   ├─ Update.begin(contentLength)
    │       │   │   → Chuẩn bị phân vùng Flash để ghi
    │       │   │
    │       │   ├─ Update.writeStream(*clientPtr)
    │       │   │   → Ghi dữ liệu từ HTTP stream vào Flash
    │       │   │   → Nếu viết < contentLength → Lỗi
    │       │   │
    │       │   └─ Update.end()
    │       │       └─ Hoàn tất ghi, kiểm tra checksum
    │       │
    │       ├─ Bước 5: Gửi báo cáo thành công (với Mutex bảo vệ)
    │       │   │
    │       │   ├─ xSemaphoreTake(mqttMutex, portMAX_DELAY)
    │       │   │
    │       │   ├─ Tạo JSON:
    │       │   │   {
    │       │   │     "mac_address": "FA:KE:21:B6:9E:30",
    │       │   │     "status": "success",
    │       │   │     "version": "1.0.3"
    │       │   │   }
    │       │   │
    │       │   ├─ client.publish("air/firmwareupdatestatus", buffer)
    │       │   │   → Đẩy vào MQTT buffer
    │       │   │
    │       │   ├─ FOR i=0 to 9:
    │       │   │   ├─ client.loop()
    │       │   │   │  → Xử lý TCP/IP, gửi buffer
    │       │   │   │
    │       │   │   └─ vTaskDelay(100ms)
    │       │   │      → Nhường CPU cho network task
    │       │   │
    │       │   ├─ client.disconnect()
    │       │   │   → Ép ngắt kết nối sạch
    │       │   │
    │       │   ├─ Chờ socket đóng hoặc timeout 3s
    │       │   │
    │       │   ├─ xSemaphoreGive(mqttMutex)
    │       │   │
    │       │   └─ vTaskDelay(2000ms)
    │       │       → Để sóng Radio thực sự tắt
    │       │
    │       └─ Bước 6: Khởi động lại
    │           └─ ESP.restart()
    │              → Tất cả task bị dừng, microcontroller reboot
    │              → Sau reboot, boot loader kiểm tra firmware mới
    │              → Nạp firmware mới vào RAM
    │
    └─ Nếu OTA thất bại → isUpdatingFirmware = false
        vTaskDelete(NULL) → Task tự xóa
```

### Luồng 6: Gửi Dữ Liệu MQTT (Mỗi 3 giây)

```
taskMQTT (Priority 1 - Thấp nhất)
    │
    ├─ Lấy mqttMutex (5000ms timeout)
    │   │
    │   ├─ handleMqtt()  → Non-blocking connect/loop
    │   │
    │   ├─ Nếu client.connected() và >= 3 giây từ lần cuối
    │   │   │
    │   │   ├─ Lấy dataMutex (2000ms timeout)
    │   │   │   │
    │   │   │   ├─ Tạo JSON:
    │   │   │   │   {
    │   │   │   │     "rooms": [
    │   │   │   │       {
    │   │   │   │         "id": 1,
    │   │   │   │         "value": 1500,
    │   │   │   │         "level": "MOD",
    │   │   │   │         "emergency": false,
    │   │   │   │         "mode": "AUTO",
    │   │   │   │         "fan": true,
    │   │   │   │         "buzzer": false,
    │   │   │   │         "window": 90
    │   │   │   │       },
    │   │   │   │       { ... room 2 ... }
    │   │   │   │     ]
    │   │   │   │   }
    │   │   │   │
    │   │   │   ├─ Nhả dataMutex
    │   │   │   │
    │   │   │   └─ client.publish("air/data", buffer)
    │   │   │       → Gửi JSON lên MQTT broker
    │   │   │
    │   │   └─ Update lastPublish timestamp
    │   │
    │   └─ Nhả mqttMutex
    │
    ├─ vTaskDelay(100ms)
    │   → Chờ 100ms rồi lặp lại
    │   → Giữ MQTT task active nhưng ít CPU
    │
    └─ Quay lại loop
```

### Luồng 7: Hiển Thị LCD (Mỗi 2 giây, Cycle 2 phòng)

```
taskLCD (Priority 2)
    │
    ├─ page = 0 (phòng hiện tại)
    │
    ├─ Nếu isUpdatingFirmware:
    │   │
    │   ├─ Lấy i2cMutex
    │   ├─ Hiển thị:
    │   │   Line 1: "Update Firmware"
    │   │   Line 2: "Successfully!" (nếu otaSuccess)
    │   │            hoặc "Downloading..."
    │   ├─ Nhả i2cMutex
    │   ├─ vTaskDelay(1000ms)
    │   └─ Continue (bỏ qua logic bình thường)
    │
    ├─ Copy data từ rooms[page]:
    │   ├─ cRaw = rooms[page].raw
    │   ├─ cLevel = rooms[page].level
    │   ├─ cFan = rooms[page].currentFan
    │   ├─ cBuz = rooms[page].currentBuzzer
    │   ├─ cWin = rooms[page].currentWindowAngle
    │   ├─ cMode = rooms[page].mode
    │   └─ cEmg = rooms[page].isEmergency
    │
    ├─ Nếu cEmg (khẩn cấp):
    │   │
    │   ├─ Hiển thị:
    │   │   Line 1: "R1 STATUS:" (hoặc R2)
    │   │   Line 2: "EMERGENCY ALERT!"
    │   │
    │   └─ (Override dữ liệu thông thường)
    │
    ├─ Nếu không khẩn cấp (bình thường):
    │   │
    │   ├─ Hiển thị:
    │   │   Line 1: "R1:1500 MOD W090"  (Phòng, Raw, Level, Window)
    │   │   Line 2: "F:ON  M:A Bu:OFF"  (Fan, Mode (A/M), Buzzer)
    │   │
    │   └─ (Đặc tính: Ngắn gọn, dễ đọc)
    │
    ├─ Lấy i2cMutex
    │   │
    │   ├─ Nếu flagResetI2C (relay vừa nhảy):
    │   │   ├─ flagResetI2C = false
    │   │   ├─ Wire.end()  → Tắt I2C bus
    │   │   ├─ delay(20)  → Chờ bus ổn định
    │   │   ├─ Wire.begin()  → Khởi động lại I2C
    │   │   ├─ lcd.init()  → Reset LCD
    │   │   ├─ ads.begin()  → Reset ADS1115
    │   │   └─ Log "[LCD] I2C Reset for EMI stability"
    │   │
    │   ├─ In Line 1 & Line 2 lên LCD
    │   │
    │   └─ Nhả i2cMutex
    │
    ├─ page = (page + 1) % ROOM_COUNT
    │   → Cycle giữa phòng 0, 1, 0, 1, ...
    │
    ├─ vTaskDelay(2000ms)
    │   → Mỗi phòng hiển thị 2 giây
    │   → 2 phòng × 2 giây = 4 giây cho 1 cycle
    │
    └─ Quay lại loop
```

---

## Phân Tích Từng Task

### Task 1: Emergency (Priority 6)

**Mục Đích:** Xử lý nút bấm khẩn cấp với phản ứng cực nhanh.

**Triggers:**
- ISR từ nút bấm → Set flag + notification
- Chỉ xử lý nếu không đang OTA

**Logic:**
```
┌─ Nút R1 (GPIO 34)
│  └─ Toggle: isEmergency[0] = !isEmergency[0]
│     ├─ Nếu bật: Quạt+Còi+Cửa full, ép MANUAL
│     └─ Nếu tắt: Trở về AUTO (sau khi Sensor kiểm tra)
│
├─ Nút R2 (GPIO 35)
│  └─ Toggle: isEmergency[1] = !isEmergency[1]
│     ├─ Nếu bật: Quạt+Còi+Cửa full, ép MANUAL
│     └─ Nếu tắt: Trở về AUTO
│
└─ Nút ALL (GPIO 23)
   └─ Toggle: Nếu có phòng nào OFF thì bật cả 2
             Nếu cả 2 đã ON thì tắt cả 2
```

**Độ Ưu Tiên:**
- Priority 6 (cao nhất)
- Đánh thức từ ISR ngay lập tức
- Phản ứng < 10ms

### Task 2: Control (Priority 4)

**Mục Đích:** Não bộ điều khiển logic chính của hệ thống.

**Triggers:**
- Sensor phát hiện nguy hiểm (DANG)
- Emergency bấm nút
- Control lệnh từ MQTT
- Timeout 1.5 giây

**Logic Ưu Tiên:**
```
Level 1 (Cao nhất): EMERGENCY (nút bấm)
        ├─ targetFan = true
        ├─ targetBuzzer = true
        └─ targetWindowAngle = 180°

Level 2: AUTO/DANGER (DANG level)
        ├─ Ép mode MANUAL
        ├─ Bật full thiết bị như Emergency
        └─ Log "[ALARM] Mức DANG!"

Level 3: AUTO/NORMAL (GOOD/MOD/BAD)
        ├─ Buzzer OFF (trừ trường hợp khẩn cấp)
        ├─ Fan = (level == "BAD")
        └─ Window = map(raw, 400→3000, 0→180)

Level 4 (thấp): MANUAL/USER CONTROL
        └─ Lệnh từ MQTT điều khiển trực tiếp
```

**Thực Thi Phần Cứng:**
```c
executeBuzzer(i);     // Chỉ ghi nếu thay đổi
executeFan(i);        // Ghi + set flagResetI2C nếu bật Relay
executeWindow(i);     // Chỉ ghi nếu khác > 2° (hysteresis)
```

### Task 3: Sensor (Priority 3)

**Mục Đích:** Đọc cảm biến ADC và phân loại mức độ khí gas.

**Triggers:**
- Timeout 1 giây (định kỳ)

**Luồng Chi Tiết:**
```
1. Lấy i2cMutex → Đọc ADS1115 ch0, ch1 (16-bit)
   ├─ adc_val[0] = ads.readADC_SingleEnded(0)
   ├─ adc_val[1] = ads.readADC_SingleEnded(1)
   └─ Map về 12-bit: rawValues[i] = map(adc_val, 0, 26666, 0, 4095)

2. Lấy dataMutex → Lọc + phân loại
   ├─ Lọc EMA: filtered = 0.2 × raw + 0.8 × filtered_cũ
   ├─ raw = (int)filtered
   ├─ error = (raw < MQ_MIN) || (raw > MQ_MAX)
   ├─ level = getLevel(raw)  → GOOD/MOD/BAD/DANG
   └─ Nếu level == "DANG" → xTaskNotifyGive(Control) để xử lý ngay

3. Nhả dataMutex

4. vTaskDelay(1000ms)
```

**Xác Định Lỗi Cảm Biến:**
```
MQ_MIN = 50   → Nếu raw < 50 → Cảm biến không hoạt động
MQ_MAX = 3800 → Nếu raw > 3800 → Cảm biến bão hòa hoặc lỗi kết nối
```

### Task 4: LCD (Priority 2)

**Mục Đích:** Hiển thị thông tin trạng thái lên LCD 16x2.

**Cycles:**
- Mỗi 2 giây hiển thị 1 phòng
- 4 giây cho 1 cycle đầy đủ (2 phòng)

**Format Hiển Thị:**

Normal Mode:
```
┌────────────────┐
│ R1:1500 MOD W090 │  ← Phòng 1, Raw 1500, Level MOD, Window 90°
│ F:ON  M:A Bu:OFF │  ← Fan ON, Mode AUTO, Buzzer OFF
└────────────────┘
```

Emergency Mode:
```
┌────────────────┐
│ R1 STATUS:     │
│ EMERGENCY ALERT!│
└────────────────┘
```

OTA Mode:
```
┌────────────────┐
│ Update Firmware │
│ Downloading... │  (hoặc "Successfully!")
└────────────────┘
```

**Reset I2C (EMI Handling):**
```
Khi Relay bật/tắt:
  ├─ flagResetI2C = true (set trong Control)
  └─ LCD Task detect:
     ├─ Wire.end() + delay(20)
     ├─ Wire.begin()
     └─ Reinit LCD + ADS1115
     
Tác dụng: Đặt lại I2C bus để tránh lỗi giao tiếp từ EMI
```

### Task 5: MQTT (Priority 1)

**Mục Đích:** Truyền thông với server qua MQTT.

**Công Việc:**
```
1. Non-blocking connect/reconnect
   ├─ Nếu không kết nối và > 5 giây
   │  └─ Thử connect
   └─ Nếu kết nối rồi → loop() xử lý message

2. Mỗi 3 giây publish "air/data"
   ├─ Lấy dataMutex
   ├─ Tạo JSON toàn bộ trạng thái phòng
   ├─ serializeJson()
   ├─ client.publish("air/data", buffer)
   └─ Nhả dataMutex

3. Subscribe callbacks (mqttCallback)
   ├─ "air/control" → Đặt target values
   └─ "air/updatefirmware" → Tạo taskOTA
```

**Subscribe Logic:**
```
air/control message:
  ├─ Parse room, mode, fan, buzzer, window
  ├─ Kiểm tra: Nếu room.isEmergency → Reject command
  └─ Update target values + notify Control

air/updatefirmware message:
  ├─ Parse url, version
  ├─ Kiểm tra: Nếu bất kỳ room.isEmergency → Reject OTA
  └─ Tạo taskOTA(url, version)
```

### Task 6: OTA (Priority 5, Ad-hoc)

**Kích Hoạt:** Khi nhận MQTT "air/updatefirmware"

**6 Bước Chi Tiết:**

1. **Hardware Safeguard (2 giây):**
   ```
   ├─ isUpdatingFirmware = true
   │  └─ Tất cả task khác detect và dừng xử lý nặng
   ├─ vTaskDelay(2000ms) → Đợi task nhả Mutex
   ├─ digitalWrite(relay/buzzer, LOW) → Tắt tất cả
   └─ Log "[OTA] Hardware safeguard enabled"
   ```

2. **Network Check:**
   ```
   └─ Nếu WiFi.status() != WL_CONNECTED
      └─ Báo lỗi & cancel
   ```

3. **HTTP/HTTPS Support:**
   ```
   ├─ Nếu URL.startsWith("https")
   │  ├─ secureClient.setInsecure() → Bypass SSL check
   │  └─ http.begin(secureClient, url)
   └─ Nếu HTTP
      └─ http.begin(normalClient, url)
   ```

4. **Flash Write:**
   ```
   ├─ httpCode = http.GET()
   ├─ contentLength = http.getSize()
   ├─ Update.begin(contentLength) → Reserve Flash
   ├─ Update.writeStream() → Write chunks
   └─ Update.end() → Finalize + checksum
   ```

5. **Success Report (with Mutex):**
   ```
   ├─ xSemaphoreTake(mqttMutex)
   ├─ Build JSON: {mac_address, status, version}
   ├─ client.publish("air/firmwareupdatestatus")
   ├─ Loop 10× với client.loop() → Đợi gửi
   ├─ client.disconnect() → Clean close
   ├─ xSemaphoreGive(mqttMutex)
   └─ vTaskDelay(2000ms) → Radio cool down
   ```

6. **Restart:**
   ```
   └─ ESP.restart() → Reboot toàn bộ hệ thống
      Bootloader sẽ nạp firmware mới
   ```

---

## Xử Lý Dữ Liệu

### 1. EMA Filter (Exponential Moving Average)

**Công Thức:**
```
EMA[t] = α × X[t] + (1-α) × EMA[t-1]

Trong code:
α = 0.2 = 20%

rooms[i].filtered = 0.2 * rawValues[i] + 0.8 * rooms[i].filtered;
```

**Ví Dụ Số (α = 0.2):**
```
Lần 1: raw=1000, filtered=0
  → EMA = 0.2×1000 + 0.8×0 = 200

Lần 2: raw=950, filtered=200
  → EMA = 0.2×950 + 0.8×200 = 350

Lần 3: raw=1050, filtered=350
  → EMA = 0.2×1050 + 0.8×350 = 490

Lần 4: raw=1000, filtered=490
  → EMA = 0.2×1000 + 0.8×490 = 592
```

**Đồ Thị:**
```
Raw (thô)        Filtered (lọc)
  │ ╱╲ ╱╲           │   ╱────
  │╱  ╲╱  ╲        │  ╱
  └─────────→      └─────────→
  
Raw có many spikes, Filtered mượt mà
```

**Tác Dụng:**
- Loại bỏ nhiễu cảm biến
- Tạo đường cong mượt mà
- Phản ứng nhanh (α=0.2) nhưng không quá nhạy

### 2. Mapping ADC

**Chuyển Đổi 16-bit → 12-bit:**
```c
int16_t adc_val = ads.readADC_SingleEnded(channel);  // 0-26666
int raw = map(adc_val, 0, 26666, 0, 4095);            // 0-4095
```

**Công Thức Map:**
```
map(x, in_min, in_max, out_min, out_max)
= (x - in_min) × (out_max - out_min) / (in_max - in_min) + out_min
= (adc_val - 0) × (4095 - 0) / (26666 - 0) + 0
= adc_val × 4095 / 26666
```

**Tại Sao:**
- ADS1115 16-bit: 0V→26666, 5V→26666
- Code cũ dùng logic 12-bit: 0V→0, ~5V→4095
- Mapping giữ nguyên hành vi

### 3. Level Classification

```c
const char* getLevel(int v) {
  if (v < 1200) return "GOOD";  // Tốt
  if (v < 2000) return "MOD ";  // Trung bình
  if (v < 3000) return "BAD ";  // Xấu
  return "DANG";                // Nguy hiểm
}
```

**Thresholds:**
| Range      | Level | Hành Động                  |
|-----------|-------|---------------------------|
| 0-1200    | GOOD  | Quạt OFF, Buzzer OFF       |
| 1200-2000 | MOD   | Quạt ON, Buzzer OFF        |
| 2000-3000 | BAD   | Quạt ON, Buzzer ON, Fan-50% |
| 3000+     | DANG  | FULL (Quạt+Buzzer+Cửa180) |

### 4. Window Angle Mapping

```c
rooms[i].targetWindowAngle = map(rooms[i].raw, 400, 3000, 0, 180);
```

**Logic:** Mở cửa sổ tỉ lệ với mức gas:
```
Raw    Window Angle
400    0°      (Tắt hẳn)
1200   ~29°    (Mở nhẹ)
2000   ~71°    (Mở trung)
3000   180°    (Mở tối đa)
```

---

## Cơ Chế An Toàn

### 1. Watchdog Timer (WDT)

**Cấu Hình:**
```c
esp_task_wdt_config_t wdt_config = {
    .timeout_ms = 30000,        // 30 giây timeout
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
};
esp_task_wdt_init(&wdt_config);
```

**Cơ Chế:**
```
┌─ Mỗi Task phải call esp_task_wdt_reset() trong 30 giây
│  ├─ Nếu reset → Tiếp tục chạy (WDT count reset)
│  └─ Nếu không reset → WDT trigger
│
└─ Khi WDT trigger:
   ├─ Lưu reset reason: ESP_RST_TASK_WDT
   ├─ Khôi phục từ RTC backup (savedMode, savedFan, ...)
   ├─ Reboot ESP32
   └─ Hệ thống tiếp tục từ trạng thái cuối
```

**Lợi Ích:**
- Tự động phục hồi từ task stuck/infinite loop
- Không cần manual reboot
- Hệ thống luôn khả dụng

### 2. RTC Backup Memory

```c
RTC_DATA_ATTR Mode savedMode[ROOM_COUNT];
RTC_DATA_ATTR bool savedEmergency[ROOM_COUNT];
RTC_DATA_ATTR bool wasResetByWDT = false;
```

**Đặc Điểm RTC:**
- Không mất khi WDT reset (chỉ mất khi power-cycle)
- Có thể lưu trữ khoảng ~8KB dữ liệu
- Nằm ngoài RAM chính

**Khôi Phục Logic:**
```c
if (wasResetByWDT) {
  rooms[i].mode = savedMode[i];
  rooms[i].currentFan = savedFan[i];
  digitalWrite(relayPins[i], rooms[i].currentFan ? HIGH : LOW);
  // ... restore phần cứng theo state cũ
}
```

### 3. Debounce Interrupt (250ms)

```c
const unsigned long DEBOUNCE_TIME = 250;

void IRAM_ATTR isrR1() {
  unsigned long interrupt_time = millis();
  if (interrupt_time - last_interrupt_time > DEBOUNCE_TIME) {
    // Xử lý
    last_interrupt_time = interrupt_time;
  }
}
```

**Vấn Đề Không Có Debounce:**
```
1 lần bấm button
  ↓
Button dội (bounce) → 5-10 ngắt
  ↓
Bát ngờ nhiều lần bấm
  ↓
Khẩn cấp bật/tắt/bật/tắt/...
```

**Giải Pháp:**
- Chỉ xử lý nếu > 250ms từ lần cuối
- 250ms = Button ổn định

### 4. OTA Safety Check

```c
// Trước khi OTA
bool safetyCheckFailed = false;
if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
  if (rooms[0].isEmergency || rooms[1].isEmergency) {
    safetyCheckFailed = true;  // Reject OTA
  }
  xSemaphoreGive(dataMutex);
}
```

**Tại Sao:**
- OTA reset hệ thống → Không chủ động điều khiển
- Nếu khẩn cấp đang ON → Quạt + Buzzer bị tắt giữa đường
- Lập trình: Từ chối OTA nếu khẩn cấp hoạt động

### 5. MQTT Callback Permission Check

```c
if (strcmp(topic, "air/control") == 0) {
  // ...
  if (rooms[idx].isEmergency) {
    Serial.printf("[SECURITY] R%d EMERGENCY! Reject command\n", room);
    return;  // Từ chối lệnh từ server
  }
}
```

**Mục Đích:**
- Khẩn cấp phải ưu tiên cao hơn lệnh server
- Server không thể override emergency state

### 6. Hardware Safeguard (OTA)

```c
Serial.println("[OTA] Hardware safeguard: Tắt all Relay & Buzzer...");
for (int i = 0; i < ROOM_COUNT; i++) {
  digitalWrite(relayPins[i], LOW);
  digitalWrite(buzzerPins[i], LOW);
}
```

**Lý Do:**
- OTA cần CPU 100% → Không thể điều khiển servo/relay an toàn
- Tắt tất cả → Đảm bảo an toàn phần cứng
- Buzzer OFF → Không gây ồn ào

### 7. Non-Blocking WiFi/MQTT

```c
void handleMqtt() {
  if (!client.connected()) {
    if (millis() - lastMqttRetry > 5000) {
      // Thử lại mỗi 5 giây
      client.connect(...);
    }
  } else {
    client.loop();  // Process incoming
  }
}
```

**Tác Dụng:**
- Không block → Sensor, LCD, Control vẫn hoạt động
- WiFi mất → Hệ thống bị gián đoạn 5 giây, không hoàn toàn down

---

## Tóm Tắt Kiến Trúc

### Stack Xử Lý:

```
┌─────────────────────────────────┐
│   Application Logic             │
│  (Control, Sensor, LCD, MQTT)   │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│    FreeRTOS Scheduler           │
│  (6 Tasks, Priority-based)      │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│    Synchronization Primitives   │
│  (Mutex, Semaphore, Notify)     │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│     Hardware Abstraction Layer   │
│  (GPIO, I2C, UART, WiFi, SPI)   │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│    ESP32 Microcontroller        │
│  (Dual-Core, 240MHz, 4MB RAM)   │
└─────────────────────────────────┘
```

### Ưu Điểm Kiến Trúc:

✅ **Đa Luồng**: 6 task độc lập, không block lẫn nhau
✅ **Real-time**: Priority-based scheduling, Watchdog protection
✅ **Robust**: RTC backup, OTA safety check, emergency override
✅ **Efficient**: Non-blocking I/O, Mutex-protected shared data
✅ **Scalable**: Dễ thêm task/feature mới

---

**Phiên Bản Firmware:** newestVersion.ino (2026-04-28)
**Kiến Trúc:** FreeRTOS 6-Task RTOS
**Cảm Biến:** ADS1115 ADC (2 kênh)
**Truyền Thông:** MQTT + WiFi
**An Toàn:** WDT + RTC Backup + Emergency Override

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h> 
#include <esp_task_wdt.h> 
#include <esp_system.h>
#include <Adafruit_ADS1X15.h> // Thư viện cho ADS1115
#include <HTTPClient.h>       // Thư viện hỗ trợ tải Firmware (NEW)
#include <Update.h>           // Thư viện hỗ trợ OTA (NEW)

/* ================= WIFI & MQTT ================= */
#define WIFI_SSID     "TP-Link_4142"
#define WIFI_PASSWORD "88202143"

#define MQTT_SERVER   "21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USERNAME "nhung1"
#define MQTT_PASSWORD "12345Nhung"
char clientId[32]; 

/* ================= PIN MAPPING & HARDWARE ================= */
#define SDA_PIN 21
#define SCL_PIN 22
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_ADS1115 ads; // Khởi tạo ADS1115 (Mặc định I2C Address là 0x48)

#define ROOM_COUNT 2
// adcPins không còn là chân Analog ESP32, giờ sẽ map với kênh của ADS1115 (0 và 1)
const int adsChannels[ROOM_COUNT] = {0, 1}; 
const int servoPins[ROOM_COUNT]   = {26, 27}; // SG90
const int relayPins[ROOM_COUNT]   = {32, 33}; // Relay 
const int buzzerPins[ROOM_COUNT]  = {25, 4};  // SFM-27

// (NEW) ĐỊNH NGHĨA CHÂN NÚT BẤM KHẨN CẤP
#define BTN_EMG_R1 34
#define BTN_EMG_R2 35
#define BTN_EMG_ALL 23

#define MQ_MIN 50
#define MQ_MAX 3800

enum Mode { AUTO, MANUAL };

/* ================= ROOM MODEL ================= */
struct Room {
  int raw;
  float filtered;
  bool error;
  
  bool targetFan;
  bool targetBuzzer;
  int targetWindowAngle; 
  
  bool currentFan;
  bool currentBuzzer;
  int currentWindowAngle;
  
  Mode mode;
  const char* level;
  
  // (NEW) Cờ trạng thái khẩn cấp độc lập cho từng phòng
  bool isEmergency; 
};

Room rooms[ROOM_COUNT];
Servo windowServos[ROOM_COUNT];

/* ================= [RTC BACKUP] BỘ NHỚ SINH TỒN ================= */
RTC_DATA_ATTR Mode savedMode[ROOM_COUNT];
RTC_DATA_ATTR bool savedFan[ROOM_COUNT];
RTC_DATA_ATTR bool savedBuzzer[ROOM_COUNT];
RTC_DATA_ATTR int savedWindowAngle[ROOM_COUNT];
// (NEW) Lưu trạng thái khẩn cấp vào RTC để không bị mất khi WDT reset
RTC_DATA_ATTR bool savedEmergency[ROOM_COUNT]; 
RTC_DATA_ATTR bool wasResetByWDT = false; 

/* ================= SYNC (RTOS) ================= */
SemaphoreHandle_t dataMutex; // Bảo vệ mảng rooms
SemaphoreHandle_t i2cMutex;  // BẢO VỆ CHUNG BUS I2C (ADS1115 và LCD)
SemaphoreHandle_t mqttMutex; // (NEW) BẢO VỆ LUỒNG TRUY CẬP THƯ VIỆN MQTT
volatile bool flagResetI2C = false;

// Các biến toàn cục quản lý OTA (NEW)
volatile bool isUpdatingFirmware = false; 
volatile bool otaSuccess = false;

// (NEW) Cờ hiệu cho ngắt (Interrupt)
volatile bool flagTriggerR1 = false;
volatile bool flagTriggerR2 = false;
volatile bool flagTriggerAll = false;

// (NEW) Gán cứng địa chỉ định danh cho thiết bị này
const String DEVICE_MAC = "FA:KE:21:B6:9E:30";

// (NEW) Biến lưu tên phiên bản để báo cáo sau khi nạp xong
String targetVersion = "Unknown";

TaskHandle_t controlTaskHandle = NULL; 
TaskHandle_t emergencyTaskHandle = NULL; // (NEW) Handle cho task xử lý khẩn cấp

// Biến lưu thời gian ngắt cuối cùng để chống dội (Debounce)
volatile unsigned long last_interrupt_time = 0;
const unsigned long DEBOUNCE_TIME = 250; // 250ms là khoảng thời gian an toàn


/* ================= INTERRUPT SERVICE ROUTINES (ISR) ================= */
// (NEW) Các hàm ngắt phản ứng tức thì khi nhấn nút
void IRAM_ATTR isrR1() {
  unsigned long interrupt_time = millis();
  if (interrupt_time - last_interrupt_time > DEBOUNCE_TIME && !isUpdatingFirmware) {
    flagTriggerR1 = true;
    if(emergencyTaskHandle) vTaskNotifyGiveFromISR(emergencyTaskHandle, NULL);
    last_interrupt_time = interrupt_time;
  }
}

void IRAM_ATTR isrR2() {
  unsigned long interrupt_time = millis();
  if (interrupt_time - last_interrupt_time > DEBOUNCE_TIME && !isUpdatingFirmware) {
    flagTriggerR2 = true;
    if(emergencyTaskHandle) vTaskNotifyGiveFromISR(emergencyTaskHandle, NULL);
    last_interrupt_time = interrupt_time;
  }
}

void IRAM_ATTR isrAll() {
  unsigned long interrupt_time = millis();
  if (interrupt_time - last_interrupt_time > DEBOUNCE_TIME && !isUpdatingFirmware) {
    flagTriggerAll = true;
    if(emergencyTaskHandle) vTaskNotifyGiveFromISR(emergencyTaskHandle, NULL);
    last_interrupt_time = interrupt_time;
  }
}

/* ================= MQTT GLOBAL ================= */
WiFiClientSecure espClient;
PubSubClient client(espClient);
unsigned long lastMqttRetry = 0;

/* ================= HARDWARE ACTUATOR FUNCTIONS ================= */
void executeBuzzer(int i) {
  if (rooms[i].currentBuzzer != rooms[i].targetBuzzer) {
    digitalWrite(buzzerPins[i], rooms[i].targetBuzzer ? HIGH : LOW);
    rooms[i].currentBuzzer = rooms[i].targetBuzzer;
    Serial.printf("[ACTION] Còi R%d chuyển sang: %s\n", i + 1, rooms[i].currentBuzzer ? "ON" : "OFF");
  }
}

void executeFan(int i) {
  if (rooms[i].currentFan != rooms[i].targetFan) { 
    digitalWrite(relayPins[i], rooms[i].targetFan ? HIGH : LOW);
    rooms[i].currentFan = rooms[i].targetFan;
    Serial.printf("[ACTION] Quạt R%d chuyển sang: %s\n", i + 1, rooms[i].currentFan ? "ON" : "OFF");
    flagResetI2C = true; // Báo cho LCD biết Relay vừa nhảy để dập nhiễu
  }
}

void executeWindow(int i) {
  int tAngle = rooms[i].targetWindowAngle;
  if (tAngle < 0) tAngle = 0;
  if (tAngle > 180) tAngle = 180;
  
  if (abs(rooms[i].currentWindowAngle - tAngle) > 2) {
    windowServos[i].write(tAngle);
    rooms[i].currentWindowAngle = tAngle;
    Serial.printf("[ACTION] Cửa sổ R%d quay đến góc: %d độ\n", i + 1, tAngle);
  }
}

/* ================= UTILITY ================= */
void connectWiFi() {
  Serial.println("\n========== WIFI CONNECT ==========");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 40) {
    delay(500); Serial.print("."); retry++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] IP: %s\n", WiFi.localIP().toString().c_str());
  }
  Serial.println("==================================\n");
}

const char* getLevel(int v) {
  if (v < 1200) return "GOOD";
  if (v < 2000) return "MOD ";
  if (v < 3000) return "BAD ";
  return "DANG";
}

/* ================= (NEW) TASK: EMERGENCY PROCESSOR (Prio 6) ================= */
// Task xử lý trạng thái khẩn cấp với độ ưu tiên cao nhất hệ thống
void taskEmergency(void *pv) {
  for (;;) {
 
    // Đợi ngắt, sau khi nhận xong thì xóa sạch (Clear) giá trị thông báo về 0
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

    // Kiểm tra chéo: Nếu trong lúc đợi mà hệ thống nhảy vào OTA thì bỏ qua xử lý này
    if (isUpdatingFirmware) {
        flagTriggerR1 = flagTriggerR2 = flagTriggerAll = false;
        continue;
    }

    // Kiểm tra an toàn I2C/Data Mutex với thời gian chờ ngắn để phản ứng nhanh
    if (xSemaphoreTake(dataMutex, 100 / portTICK_PERIOD_MS) == pdTRUE) {

      // 1. Xử lý nút bấm Phòng 1
      if (flagTriggerR1) {
        rooms[0].isEmergency = !rooms[0].isEmergency;
        if (!rooms[0].isEmergency) rooms[0].mode = AUTO; // Nhả khẩn cấp về AUTO
        flagTriggerR1 = false;
        Serial.printf("[SECURITY] Nút R1: %s\n", rooms[0].isEmergency ? "EMERGENCY ON" : "EMERGENCY OFF");
      }
      
      // 2. Xử lý nút bấm Phòng 2
      if (flagTriggerR2) {
        rooms[1].isEmergency = !rooms[1].isEmergency;
        if (!rooms[1].isEmergency) rooms[1].mode = AUTO; // Nhả khẩn cấp về AUTO
        flagTriggerR2 = false;
        Serial.printf("[SECURITY] Nút R2: %s\n", rooms[1].isEmergency ? "EMERGENCY ON" : "EMERGENCY OFF");
      }

      // 3. Xử lý nút bấm Tổng (All Rooms)
      if (flagTriggerAll) {
        // Toggle: Nếu cả 2 chưa bật thì bật cả 2, nếu có cái bật rồi thì tắt sạch về AUTO

        bool anyOff = (!rooms[0].isEmergency || !rooms[1].isEmergency);
        bool newState = anyOff; // Nếu có phòng chưa bật thì bật tất cả
        
        rooms[0].isEmergency = newState;
        rooms[1].isEmergency = newState;
        if (!newState) { rooms[0].mode = AUTO; rooms[1].mode = AUTO; }
        
        flagTriggerAll = false;
        Serial.printf("[SECURITY] Nút ALL: %s\n", newState ? "EMERGENCY ON" : "EMERGENCY OFF");
      }

      xSemaphoreGive(dataMutex);
      
      // Gọi não bộ Control xử lý phần cứng ngay lập tức
      if (controlTaskHandle) xTaskNotifyGive(controlTaskHandle);

      // Quan trọng: Nghỉ một nhịp rất ngắn để phần cứng ổn định điện áp sau khi đóng Relay
      vTaskDelay(50 / portTICK_PERIOD_MS);
    }
  }
}

/* ================= TASK: OTA UPDATE FIRMWARE (NEW) ================= */
void taskOTA(void *pv) {

  String url = *(String*)pv;
  delete (String*)pv; // Giải phóng bộ nhớ con trỏ string được pass vào

  Serial.println("\n========== BẮT ĐẦU CẬP NHẬT OTA ==========");
  isUpdatingFirmware = true; // Kích hoạt cờ ngắt để các task khác tự động nhường CPU và nhả Mutex

  // Đợi 2 giây để đảm bảo Control, Sensor và MQTT nhả toàn bộ Mutex và vào trạng thái yield
  vTaskDelay(2000 / portTICK_PERIOD_MS);

  // BƯỚC 1: XỬ LÝ NGOẠI LỆ AN TOÀN PHẦN CỨNG
  Serial.println("[OTA] Đang ngắt an toàn phần cứng (Tắt Relay & Còi)...");
  for (int i = 0; i < ROOM_COUNT; i++) {
    digitalWrite(relayPins[i], LOW);
    digitalWrite(buzzerPins[i], LOW);
  }

  // BƯỚC 2: KIỂM TRA MẠNG
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[OTA] LỖI: Mất kết nối WiFi, hủy cập nhật!");
    isUpdatingFirmware = false; 
    vTaskDelete(NULL);
    return;
  }

  HTTPClient http;
  WiFiClientSecure secureClient;
  WiFiClient normalClient;

  Serial.printf("[OTA] Đang kết nối tải Firmware từ: %s\n", url.c_str());

  // BƯỚC 3: HỖ TRỢ LINH HOẠT HTTP VÀ HTTPS
  if (url.startsWith("https")) {
    secureClient.setInsecure(); // Bypass SSL để tiết kiệm bộ nhớ / tránh lỗi chứng chỉ hết hạn
    http.begin(secureClient, url);
  } else {
    http.begin(normalClient, url);
  }

  // BƯỚC 4: TIẾN HÀNH TẢI VÀ GHI FLASH
  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    int contentLength = http.getSize();
    Serial.printf("[OTA] Tổng dung lượng Firmware: %d bytes\n", contentLength);

    if (contentLength > 0) {
      bool canBegin = Update.begin(contentLength);
      if (canBegin) {
        Serial.println("[OTA] Đang tiến hành ghi Flash. Vui lòng không tắt nguồn...");
        
        WiFiClient *clientPtr = url.startsWith("https") ? (WiFiClient*)&secureClient : &normalClient;
        size_t written = Update.writeStream(*clientPtr);

        if (written == contentLength) {
          Serial.println("[OTA] Tải và ghi dữ liệu thành công, đang xác thực...");
        } else {
          Serial.printf("[OTA] LỖI GHI DỮ LIỆU: Mới ghi được %d/%d bytes\n", written, contentLength);
        }

        // BƯỚC 5: KẾT THÚC VÀ REBOOT
        if (Update.end()) {
          if (Update.isFinished()) {
            Serial.println("[OTA] HOÀN TẤT CẬP NHẬT (SUCCESSFULLY)! Chuẩn bị khởi động lại...");
            otaSuccess = true; // Phím hiệu cho Task LCD hiển thị "Successfully!"

            // --- GỬI THÔNG BÁO THÀNH CÔNG LÊN SERVER ---
            if (xSemaphoreTake(mqttMutex, portMAX_DELAY)) {
              if (client.connected()) {
                StaticJsonDocument<256> reportDoc;
                char reportBuffer[256];
                
                reportDoc["mac_address"] = DEVICE_MAC;
                reportDoc["update"] = true;
                reportDoc["status"] = "success";
                reportDoc["version"] = targetVersion;
                
                serializeJson(reportDoc, reportBuffer);

                Serial.println("[OTA] Đang gửi thông báo thành công lên Server...");
                
                // 1. Đẩy gói tin vào hàng đợi
                client.publish("air/firmwareupdatestatus", reportBuffer);
                
                // 2. NHƯỜNG CPU CHO NHÂN MẠNG (Dùng vTaskDelay thay vì delay)
                // Ép MQTT xử lý dữ liệu và gửi đi bằng cách nhường quyền CPU 10 lần
                for(int i = 0; i < 10; i++) {
                  client.loop(); 
                  vTaskDelay(100 / portTICK_PERIOD_MS); // Quan trọng: Cho phép Task mạng ở Core 0 hoạt động
                }

                // 3. ÉP XẢ BỘ ĐỆM BẰNG CÁCH NGẮT KẾT NỐI (Clean Disconnect)
                Serial.println("[OTA] Đang ép xả bộ đệm TCP/IP...");
                client.disconnect(); 

                // 4. Chờ cho đến khi Socket thực sự báo đóng (hoặc timeout 3 giây)
                int waitCount = 0;
                while (client.connected() && waitCount < 30) {
                  vTaskDelay(100 / portTICK_PERIOD_MS);
                  waitCount++;
                }
              }
              xSemaphoreGive(mqttMutex); 
            }

            // 5. Nghỉ ngơi 2 giây cuối cùng cho sóng Radio thực sự tắt trước khi sập nguồn
            Serial.println("[OTA] Đã ngắt mạng an toàn. Khởi động lại hệ thống!");
            vTaskDelay(2000 / portTICK_PERIOD_MS); 
            ESP.restart();

          } else {
            Serial.println("[OTA] LỖI: Update chưa hoàn tất quá trình.");
          }
        } else {
          Serial.printf("[OTA] LỖI KẾT THÚC OTA: %s\n", Update.errorString());
        }
      } else {
        Serial.printf("[OTA] LỖI FLASH (Hết bộ nhớ/Sai Partition): %s\n", Update.errorString());
      }
    } else {
      Serial.println("[OTA] LỖI: Kích thước file bằng 0!");
    }
  } else {
    Serial.printf("[OTA] LỖI TẢI FILE: Server trả về mã HTTP %d\n", httpCode);
  }

  http.end();

  // Khôi phục lại hệ thống nếu quá trình OTA thất bại (không chạm tới bước restart)
  Serial.println("[OTA] Cập nhật thất bại. Đang khôi phục lại hoạt động bình thường...");
  isUpdatingFirmware = false; 
  vTaskDelete(NULL);
}


/* ================= TASK: CONTROL (Prio 4 - BỘ NÃO TRUNG TÂM) ================= */
void taskControl(void *pv) {

  esp_task_wdt_add(NULL); // (FIX) Đăng ký Watchdog cho não bộ

  for (;;) {

    esp_task_wdt_reset(); // (FIX) Báo cáo còn sống

    if (isUpdatingFirmware) { vTaskDelay(1000 / portTICK_PERIOD_MS); continue; } // Dừng khi đang OTA

    ulTaskNotifyTake(pdTRUE, 1500 / portTICK_PERIOD_MS);  

    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      Serial.println("[TASK: CONTROL] Đang quét logic hệ thống...");

      // XỬ LÝ LOGIC (EMERGENCY / AUTO / MANUAL)
      for (int i = 0; i < ROOM_COUNT; i++) {
        
        // (NEW) ƯU TIÊN TUYỆT ĐỐI 1: Trạng thái Khẩn cấp được kích hoạt bằng nút bấm
        if (rooms[i].isEmergency) {
           rooms[i].targetBuzzer = true;
           rooms[i].targetFan = true;
           rooms[i].targetWindowAngle = 180;
           // Ép mode về MANUAL để ngăn cản logic AUTO can thiệp sau khi nhả khẩn cấp (nếu muốn)
           // Tuy nhiên theo yêu cầu bạn muốn nó khóa cứng nên ta không cần check mode ở đây
        } 
        // ƯU TIÊN 2: Khóa an toàn tự động (Khi khí gas quá cao)
        else if (strcmp(rooms[i].level, "DANG") == 0 && rooms[i].mode == AUTO) {
          rooms[i].mode = MANUAL; 
          Serial.printf("[ALARM] R%d mức DANG! Ép khóa Mode MANUAL và bật FULL thiết bị.\n", i + 1);
          rooms[i].targetBuzzer = true;
          rooms[i].targetFan = true;
          rooms[i].targetWindowAngle = 180;
        } 
        // ƯU TIÊN 3: Logic tự động bình thường
        else if (rooms[i].mode == AUTO) {
          bool isBad = (strcmp(rooms[i].level, "BAD ") == 0);
          rooms[i].targetBuzzer = false; 
          rooms[i].targetFan = isBad;
          rooms[i].targetWindowAngle = map(rooms[i].raw, 400, 3000, 0, 180);
        }
      }

      // THỰC THI PHẦN CỨNG
      for (int i = 0; i < ROOM_COUNT; i++) {
          executeBuzzer(i);
          executeFan(i);
          executeWindow(i);
      }
      
      // [RTC BACKUP]
      for (int i = 0; i < ROOM_COUNT; i++) {
        savedMode[i] = rooms[i].mode;
        savedFan[i] = rooms[i].currentFan;
        savedBuzzer[i] = rooms[i].currentBuzzer;
        savedWindowAngle[i] = rooms[i].currentWindowAngle;
        savedEmergency[i] = rooms[i].isEmergency; // (NEW) Backup trạng thái khẩn cấp
      }
      
      xSemaphoreGive(dataMutex);
    }
  }
}

/* ================= TASK: SENSOR (Prio 3) ================= */
void taskSensor(void *pv) {

  esp_task_wdt_add(NULL); // (FIX) Đăng ký Watchdog cho cảm biến
  float alpha = 0.2;
  int rawValues[ROOM_COUNT];

  for (;;) {
    esp_task_wdt_reset(); // (FIX) Báo cáo còn sống
    if (isUpdatingFirmware) { vTaskDelay(1000 / portTICK_PERIOD_MS); continue; } // Dừng khi đang OTA

    // Serial.println("[TASK: SENSOR] Đang đọc ADS1115 qua I2C...");
    
    // 1. Chỉ lấy i2cMutex trong thời gian cực ngắn để đọc ADC (Ưu tiên phần cứng I2C)
    if (xSemaphoreTake(i2cMutex, portMAX_DELAY)) {
      for (int i = 0; i < ROOM_COUNT; i++) {
        int16_t adc_val = ads.readADC_SingleEnded(adsChannels[i]);
        // ADS1115 16-bit (0-26666 tại 5V). Ánh xạ về 12-bit (0-4095) để GIỮ NGUYÊN logic cũ
        rawValues[i] = map(adc_val, 0, 26666, 0, 4095); 
        if (rawValues[i] < 0) rawValues[i] = 0;
      }
      xSemaphoreGive(i2cMutex);
    }

    bool hasDanger = false;

    // 2. Lấy dataMutex để cập nhật mảng rooms (Tuyệt đối không gộp chung Mutex chống Deadlock)
    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      for (int i = 0; i < ROOM_COUNT; i++) {
        if (rooms[i].filtered == 0) rooms[i].filtered = rawValues[i];
        else rooms[i].filtered = alpha * rawValues[i] + (1 - alpha) * rooms[i].filtered;

        rooms[i].raw = (int)rooms[i].filtered;
        rooms[i].error = (rooms[i].raw < MQ_MIN || rooms[i].raw > MQ_MAX);
        rooms[i].level = getLevel(rooms[i].raw);
  
        // Serial.printf("  -> R%d | Kênh ADS: %d | ADC 16bit quy đổi: %d | Mức: %s\n", i + 1, adsChannels[i], rooms[i].raw, rooms[i].level);

        if (strcmp(rooms[i].level, "DANG") == 0) hasDanger = true;
      }
      xSemaphoreGive(dataMutex);
    }

    // Nếu có nguy hiểm, gọi não bộ (Task Control) dậy xử lý ngay
    if (hasDanger && controlTaskHandle != NULL) {
      Serial.println("[TASK: SENSOR] PHÁT HIỆN NGUY HIỂM! Gọi Task Control khẩn cấp!");
      xTaskNotifyGive(controlTaskHandle);
    }
    
    vTaskDelay(1000 / portTICK_PERIOD_MS); 
  }
}

/* ================= TASK: LCD (Prio 2) ================= */
void taskLCD(void *pv) {
  esp_task_wdt_add(NULL); // Đăng ký Task này với Watchdog
  int page = 0;
  char line1[17];
  char line2[17];

  for (;;) {
    esp_task_wdt_reset(); // Báo cáo còn sống
    
    // KHI ĐANG UPDATE FIRMWARE: Chuyển màn hình sang chế độ độc quyền Update
    if (isUpdatingFirmware) {
      if (xSemaphoreTake(i2cMutex, portMAX_DELAY)) {
        lcd.clear();
        lcd.setCursor(0, 0); lcd.print("Update Firmware");
        lcd.setCursor(0, 1); lcd.print(otaSuccess ? "Successfully!" : "Downloading...");
        xSemaphoreGive(i2cMutex);
      }
      vTaskDelay(1000 / portTICK_PERIOD_MS); 
      continue; 
    }

    // 1. Copy data trước ra biến tạm
    int cRaw = 0; int cWin = 0;
    const char* cLevel = "    ";
    bool cFan = false, cBuz = false, cEmg = false; Mode cMode = AUTO;

    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      cRaw = rooms[page].raw; cLevel = rooms[page].level;
      cFan = rooms[page].currentFan; cBuz = rooms[page].currentBuzzer;
      cWin = rooms[page].currentWindowAngle; cMode = rooms[page].mode;
      cEmg = rooms[page].isEmergency; // (NEW) Lấy trạng thái khẩn cấp
      xSemaphoreGive(dataMutex);
    }

    // (NEW) XỬ LÝ HIỂN THỊ LCD THEO TRẠNG THÁI KHẨN CẤP
    if (cEmg) {
      // Trường hợp khẩn cấp: Hiển thị thông báo ALERT thay vì dữ liệu
      snprintf(line1, sizeof(line1), "R%d STATUS:", page + 1);
      snprintf(line2, sizeof(line2), "EMERGENCY ALERT!");
    } else {
      // Trường hợp bình thường: Hiển thị cảm biến và trạng thái thiết bị
      snprintf(line1, sizeof(line1), "R%d:%-4d %s W%03d", page + 1, cRaw, cLevel, cWin);
      snprintf(line2, sizeof(line2), "F:%-3s M:%c Bu:%-3s", cFan ? "ON " : "OFF", cMode == AUTO ? 'A' : 'M', cBuz ? "ON" : "OFF");
    }

    // 2. Tranh I2C Bus để xử lý phần cứng và in ra LCD
    if (xSemaphoreTake(i2cMutex, portMAX_DELAY)) {
      
      if (flagResetI2C) {
        flagResetI2C = false;
        Wire.end(); delay(20);
        Wire.begin(SDA_PIN, SCL_PIN); 
        lcd.init(); lcd.backlight();
        ads.begin(); 
      }

      lcd.setCursor(0, 0); lcd.print(line1);
      lcd.setCursor(0, 1); lcd.print(line2);
      
      xSemaphoreGive(i2cMutex);
    }

    page = (page + 1) % ROOM_COUNT;
    vTaskDelay(2000 / portTICK_PERIOD_MS); 
  }
}


/* ================= MQTT CALLBACK ================= */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  
  if (strcmp(topic, "air/updatefirmware") == 0) {
    StaticJsonDocument<512> doc;
    if (!deserializeJson(doc, payload, length) && doc.containsKey("url")) {

    // KIỂM TRA ĐIỀU KIỆN AN TOÀN TRƯỚC KHI OTA
      bool safetyCheckFailed = false;
      if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
          // Nếu bất kỳ phòng nào đang EMERGENCY, từ chối cập nhật
          if (rooms[0].isEmergency || rooms[1].isEmergency) {
              safetyCheckFailed = true;
          }
          xSemaphoreGive(dataMutex);
      }

      if (safetyCheckFailed) {
          Serial.println("[SECURITY] CÓ BÁO ĐỘNG! Từ chối cập nhật Firmware để đảm bảo an toàn.");
          // Gửi báo cáo lỗi về server (Tùy chọn)
          client.publish("air/firmwareupdatestatus", "{\"status\":\"rejected\",\"reason\":\"emergency_active\"}");
          return; // Thoát ngay, không tạo Task OTA
      }

      String url = doc["url"].as<String>();
      String version = doc.containsKey("version") ? doc["version"].as<String>() : "Unknown";
      targetVersion = version;
      Serial.printf("[TASK: MQTT - IN] YÊU CẦU OTA! Phiên bản: %s\n", version.c_str());
      String* urlPtr = new String(url);
      BaseType_t xReturned = xTaskCreate(taskOTA, "OTA", 8192, (void*)urlPtr, 5, NULL);
      if (xReturned != pdPASS) { delete urlPtr; }
    }
    return; 
  }

  // --- LOGIC ĐIỀU KHIỂN CÓ CHẶN QUYỀN KHI KHẨN CẤP ---
  if (strcmp(topic, "air/control") == 0) {
    StaticJsonDocument<256> doc;
    if (!deserializeJson(doc, payload, length) && doc.containsKey("room") && doc.containsKey("mode")) {
      int room = doc["room"];
      int idx = room - 1;
      
      if (room >= 1 && room <= ROOM_COUNT && xSemaphoreTake(dataMutex, portMAX_DELAY)) {
        
        // (NEW) KIỂM TRA CHẶN QUYỀN: Nếu phòng này đang EMERGENCY thì không nhận lệnh điều khiển
        if (rooms[idx].isEmergency) {
            Serial.printf("[SECURITY] R%d đang KHẨN CẤP! Từ chối lệnh điều khiển từ xa.\n", room);
            xSemaphoreGive(dataMutex);
            return; // Thoát ngay, không thực hiện các logic bên dưới
        }

        bool stateChanged = false; 
        
        if (strcmp(doc["mode"], "AUTO") == 0 && rooms[idx].mode != AUTO) {
          rooms[idx].mode = AUTO; stateChanged = true;
          Serial.printf("[TASK: MQTT - IN] R%d xác nhận về AUTO\n", room);
        }
        else if (strcmp(doc["mode"], "MANUAL") == 0 && rooms[idx].mode != MANUAL) {
          rooms[idx].mode = MANUAL; stateChanged = true;
          Serial.printf("[TASK: MQTT - IN] R%d xác nhận sang MANUAL\n", room);
        }
        
        if (rooms[idx].mode == MANUAL) {
          if (doc.containsKey("fan") && rooms[idx].targetFan != doc["fan"]) {
             rooms[idx].targetFan = doc["fan"]; stateChanged = true;
          }
          if (doc.containsKey("buzzer") && rooms[idx].targetBuzzer != doc["buzzer"]) {
             rooms[idx].targetBuzzer = doc["buzzer"]; stateChanged = true;
          }
          if (doc.containsKey("window") && rooms[idx].targetWindowAngle != doc["window"]) {
             rooms[idx].targetWindowAngle = doc["window"]; stateChanged = true;
          }
        }
        xSemaphoreGive(dataMutex); 
        
        if (stateChanged && controlTaskHandle != NULL) {
            xTaskNotifyGive(controlTaskHandle);
        }
      }
    }
  }
}

/* ================= NON-BLOCKING MQTT CONNECT ================= */
void handleMqtt() {
  if (!client.connected()) {
    if (millis() - lastMqttRetry > 5000) { 
      lastMqttRetry = millis();
      if (client.connect(clientId, MQTT_USERNAME, MQTT_PASSWORD)) {
        client.subscribe("air/control");
        client.subscribe("air/updatefirmware"); 
      }
    }
  } else {
    client.loop();
  }
}

/* ================= TASK: MQTT (Prio 1) ================= */
void taskMQTT(void *pv) {
  esp_task_wdt_add(NULL); 

  StaticJsonDocument<512> doc;
  char buffer[512];
  unsigned long lastPublish = 0;

  for (;;) {
    esp_task_wdt_reset(); 
    
    if (isUpdatingFirmware) { vTaskDelay(1000 / portTICK_PERIOD_MS); continue; } 

    if (xSemaphoreTake(mqttMutex, 5000 / portTICK_PERIOD_MS) == pdTRUE) {
      handleMqtt(); 

      if (client.connected() && (millis() - lastPublish > 3000)) { 
        if (xSemaphoreTake(dataMutex, 2000 / portTICK_PERIOD_MS) == pdTRUE) {
          doc.clear();
          JsonArray arr = doc.createNestedArray("rooms");

          for (int i = 0; i < ROOM_COUNT; i++) {
            JsonObject r = arr.createNestedObject();
            r["id"] = i + 1; 
            r["value"] = rooms[i].raw;
            r["level"] = rooms[i].level;
            
            // (NEW) Gửi thêm trạng thái khẩn cấp lên server để App đồng bộ hiển thị
            r["emergency"] = rooms[i].isEmergency;
            
            r["mode"] = (rooms[i].mode == AUTO) ? "AUTO" : "MANUAL";
            r["fan"] = rooms[i].currentFan; 
            r["buzzer"] = rooms[i].currentBuzzer;
            r["window"] = rooms[i].currentWindowAngle;
          }
          serializeJson(doc, buffer);
          xSemaphoreGive(dataMutex); 

          client.publish("air/data", buffer); 
        } 
        lastPublish = millis();
      }
      xSemaphoreGive(mqttMutex); 
    }
    vTaskDelay(100 / portTICK_PERIOD_MS); 
  }
}

/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);
  dataMutex = xSemaphoreCreateMutex();
  i2cMutex = xSemaphoreCreateMutex(); 
  mqttMutex = xSemaphoreCreateMutex(); 
  
  esp_reset_reason_t resetReason = esp_reset_reason();
  if (resetReason == ESP_RST_TASK_WDT || resetReason == ESP_RST_INT_WDT || resetReason == ESP_RST_PANIC) {
    wasResetByWDT = true;
  } else {
    wasResetByWDT = false;
  }
  
  // (NEW) CẤU HÌNH CHÂN NÚT BẤM VÀ NGẮT
  pinMode(BTN_EMG_R1, INPUT); // Cần lắp trở kéo lên 10k bên ngoài
  pinMode(BTN_EMG_R2, INPUT);
  pinMode(BTN_EMG_ALL, INPUT);
  attachInterrupt(digitalPinToInterrupt(BTN_EMG_R1), isrR1, FALLING);
  attachInterrupt(digitalPinToInterrupt(BTN_EMG_R2), isrR2, FALLING);
  attachInterrupt(digitalPinToInterrupt(BTN_EMG_ALL), isrAll, FALLING);

  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init(); lcd.backlight();
  if (!ads.begin()) { while (1); }

  connectWiFi();

  uint8_t mac[6]; WiFi.macAddress(mac);
  snprintf(clientId, sizeof(clientId), "ESP32_%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  espClient.setInsecure(); 
  espClient.setTimeout(15); 
  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(mqttCallback);
  client.setBufferSize(1024);

  ESP32PWM::allocateTimer(0); ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2); ESP32PWM::allocateTimer(3);

  for (int i = 0; i < ROOM_COUNT; i++) {
    pinMode(relayPins[i], OUTPUT);
    pinMode(buzzerPins[i], OUTPUT);
    windowServos[i].setPeriodHertz(50); 
    windowServos[i].attach(servoPins[i], 500, 2400); 

    if (wasResetByWDT) {
      rooms[i].mode = savedMode[i];
      rooms[i].targetBuzzer = rooms[i].currentBuzzer = savedBuzzer[i];
      rooms[i].targetFan = rooms[i].currentFan = savedFan[i];
      rooms[i].targetWindowAngle = rooms[i].currentWindowAngle = savedWindowAngle[i];
      rooms[i].isEmergency = savedEmergency[i]; // (NEW) Khôi phục trạng thái khẩn cấp
      
      digitalWrite(buzzerPins[i], rooms[i].currentBuzzer ? HIGH : LOW);
      digitalWrite(relayPins[i], rooms[i].currentFan ? HIGH : LOW);
      windowServos[i].write(rooms[i].currentWindowAngle);
    } else {
      rooms[i].mode = AUTO; 
      rooms[i].isEmergency = false; // (NEW) Mặc định không khẩn cấp
      rooms[i].targetBuzzer = rooms[i].currentBuzzer = false; digitalWrite(buzzerPins[i], LOW);
      rooms[i].targetFan = rooms[i].currentFan = false; digitalWrite(relayPins[i], LOW);
      rooms[i].targetWindowAngle = rooms[i].currentWindowAngle = 0; windowServos[i].write(0);
    }
    rooms[i].level = "    ";
  }

  // (NEW) KHỞI TẠO TASK XỬ LÝ KHẨN CẤP VỚI ĐỘ ƯU TIÊN CAO NHẤT (6)
  xTaskCreate(taskEmergency, "Emergency", 3072, NULL, 6, &emergencyTaskHandle);
  
  xTaskCreate(taskControl, "Control", 3072, NULL, 4, &controlTaskHandle);
  xTaskCreate(taskSensor,  "Sensor",  2048, NULL, 3, NULL); 
  xTaskCreate(taskLCD,     "LCD",     2048, NULL, 2, NULL); 
  xTaskCreate(taskMQTT,    "MQTT",    8192, NULL, 1, NULL); 

  esp_task_wdt_config_t wdt_config = {
      .timeout_ms = 30000,
      .idle_core_mask = (1 << portNUM_PROCESSORS) - 1, 
      .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);
}

void loop() {
  esp_task_wdt_reset(); 
  vTaskDelay(1000 / portTICK_PERIOD_MS); 
}
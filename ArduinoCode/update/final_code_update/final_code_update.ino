#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h> 

// Thêm các thư viện OTA
#include <HTTPClient.h>
#include <Update.h>
#include <MD5Builder.h>

// Bổ sung thông tin Firmware và Server OTA
#define FIRMWARE_VERSION "1.0.1" // Đã nâng version lên 1.0.1 (Bản không quạt)
#define OTA_SERVER_URL "http://192.168.2.29:5000" // IP backend của bạn

// Thêm cờ hiệu để an toàn với RTOS
volatile bool flagStartOTA = false;
String targetOTAVersion = "";

/* ================= WIFI ================= */
#define WIFI_SSID     "TP-Link_4142"
#define WIFI_PASSWORD "88202143"

/* ================= MQTT ================= */
#define MQTT_SERVER   "21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USERNAME "nhung1"
#define MQTT_PASSWORD "12345Nhung"
#define CLIENT_ID     "ESP32_RTOS_1"

/* ================= PIN MAPPING ================= */
// A. Giao tiếp chung (I2C Bus)
#define SDA_PIN 21
#define SCL_PIN 22
LiquidCrystal_I2C lcd(0x27, 16, 2);

// B & C. Hệ thống Phòng 1 & Phòng 2
#define ROOM_COUNT 2
const int adcPins[ROOM_COUNT]    = {34, 35}; // MQ-135
const int servoPins[ROOM_COUNT]  = {26, 27}; // Servo SG90
const int buzzerPins[ROOM_COUNT] = {25, 4};  // Còi báo động SFM-27
// Đã xóa relayPins (Quạt)

#define MQ_MIN 50
#define MQ_MAX 3800

enum Mode { AUTO, MANUAL };

/* ================= ROOM MODEL ================= */
struct Room {
  int raw;
  float filtered;
  bool error;
  bool buzzer;
  int windowAngle; // Góc mở cửa sổ: 0 - 180
  Mode mode;
  const char* level;
};

Room rooms[ROOM_COUNT];
Servo windowServos[ROOM_COUNT];

/* ================= SYNC (RTOS MUTEX & NOTIFY) ================= */
SemaphoreHandle_t dataMutex;
TaskHandle_t controlTaskHandle = NULL;

/* ================= MQTT ================= */
WiFiClientSecure espClient;
PubSubClient client(espClient);

/* ================= WIFI ================= */
void connectWiFi() {
  Serial.println("\n========== WIFI CONNECT ==========");
  WiFi.disconnect(true, true);
  delay(1000);
  WiFi.mode(WIFI_STA);
  delay(500);
  Serial.println("[WIFI] Dang ket noi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 40) {
    delay(500);
    Serial.print(".");
    retry++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] KET NOI THANH CONG");
    Serial.print("IP: "); Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WIFI] THAT BAI");
  }
  Serial.println("==================================\n");
}

/* ================= LOGIC & ACTUATORS ================= */
const char* getLevel(int v) {
  if (v < 1200) return "GOOD";
  if (v < 2000) return "MOD ";
  if (v < 3000) return "BAD ";
  return "DANG";
}

void executeBuzzerControl(int i, bool state) {
  if (rooms[i].buzzer != state) {
    digitalWrite(buzzerPins[i], state ? HIGH : LOW); 
    rooms[i].buzzer = state;
    Serial.printf("[ACTUATOR] -> COI R%d: %s\n", i + 1, state ? "ON" : "OFF");
  }
}

void executeWindowControl(int i, int targetAngle) {
  // Giới hạn góc an toàn cho Servo
  if (targetAngle < 0) targetAngle = 0;
  if (targetAngle > 180) targetAngle = 180;
  
  // Tránh việc gọi ghi servo liên tục gây rung giật nếu góc không thay đổi
  if (abs(rooms[i].windowAngle - targetAngle) > 2) {
    windowServos[i].write(targetAngle);
    rooms[i].windowAngle = targetAngle;
    Serial.printf("[ACTUATOR] -> CUA SO R%d: Mo %d do\n", i + 1, targetAngle);
  }
}

/* ================= TASK: SENSOR (Ưu tiên 4 - Cao nhất) ================= */
void taskSensor(void *pv) {
  float alpha = 0.2;
  for (;;) {
    bool hasDanger = false; 

    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      for (int i = 0; i < ROOM_COUNT; i++) {
        int raw = analogRead(adcPins[i]);
        if (rooms[i].filtered == 0) rooms[i].filtered = raw;
        else rooms[i].filtered = alpha * raw + (1 - alpha) * rooms[i].filtered;

        rooms[i].raw = (int)rooms[i].filtered;
        rooms[i].error = (rooms[i].raw < MQ_MIN || rooms[i].raw > MQ_MAX);
        rooms[i].level = getLevel(rooms[i].raw);

        if (strcmp(rooms[i].level, "DANG") == 0) {
          hasDanger = true;
        }
      }
      xSemaphoreGive(dataMutex);
    }

    if (hasDanger && controlTaskHandle != NULL) {
      xTaskNotifyGive(controlTaskHandle); 
    }

    vTaskDelay(1000 / portTICK_PERIOD_MS); 
  }
}

/* ================= TASK: CONTROL (Ưu tiên 3) ================= */
void taskControl(void *pv) {
  for (;;) {
    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      for (int i = 0; i < ROOM_COUNT; i++) {
        
        // 1. LOGIC KHÓA "DANG" (Mức nguy hiểm nhất)
        if (strcmp(rooms[i].level, "DANG") == 0 && rooms[i].mode == AUTO) {
          rooms[i].mode = MANUAL; 
          Serial.printf("[ALARM] R%d dat muc DANG! Kich hoat khan cap va khoa che do MANUAL.\n", i + 1);
          
          executeBuzzerControl(i, true);
          executeWindowControl(i, 180);

        } 
        
        // 2. LOGIC TỰ ĐỘNG BÌNH THƯỜNG (Khi ở mức an toàn hơn)
        else if (rooms[i].mode == AUTO) {
          executeBuzzerControl(i, false); 
          
          // Hàm tuyến tính tính góc cửa sổ tỷ lệ thuận với khí gas
          int linearAngle = map(rooms[i].raw, 400, 3000, 0, 180);
          executeWindowControl(i, linearAngle);
        }
      }
      xSemaphoreGive(dataMutex);
    }
    
    ulTaskNotifyTake(pdTRUE, 1500 / portTICK_PERIOD_MS);  
  }
}

/* ================= TASK: LCD (Ưu tiên 2) ================= */
void taskLCD(void *pv) {
  int page = 0;
  char line1[17];
  char line2[17];

  for (;;) {
    // 1. LẤY DỮ LIỆU ĐỂ HIỂN THỊ
    int cRaw = 0;
    const char* cLevel = "    ";
    bool cBuz = false;
    int cWin = 0;
    Mode cMode = AUTO;

    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      cRaw   = rooms[page].raw;
      cLevel = rooms[page].level;
      cBuz   = rooms[page].buzzer;
      cWin   = rooms[page].windowAngle;
      cMode  = rooms[page].mode;
      xSemaphoreGive(dataMutex);
    }

    // 2. HIỂN THỊ TRÁNH CHỚP TẮT (Không dùng lcd.clear)
    snprintf(line1, sizeof(line1), "R%d:%-4d %s W%03d", page + 1, cRaw, cLevel, cWin);
    // Cập nhật lại dòng 2 cho cân đối khi đã bỏ quạt
    snprintf(line2, sizeof(line2), "Mode:%c Buzz:%-3s", cMode == AUTO ? 'A' : 'M', cBuz ? "ON" : "OFF");

    lcd.setCursor(0, 0);
    lcd.print(line1);
    
    lcd.setCursor(0, 1);
    lcd.print(line2);

    page = (page + 1) % ROOM_COUNT;
    vTaskDelay(2000 / portTICK_PERIOD_MS); 
  }
}

/* ================= MQTT CALLBACK ================= */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Co tin nhan dieu khien tu topic %s\n", topic);

  if (strcmp(topic, "air/control") == 0) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (!error) {
      // 1. Kiểm tra lệnh OTA UPDATE
      if (doc.containsKey("mode") && strcmp(doc["mode"], "UPDATE") == 0) {
        if (doc.containsKey("version")) {
          targetOTAVersion = doc["version"].as<String>();
          flagStartOTA = true; 
          Serial.println("[MQTT] Nhan lenh OTA Update version: " + targetOTAVersion);
        }
        return; 
      }

      // 2. Logic điều khiển MANUAL
      if (doc.containsKey("room") && doc.containsKey("mode")) {
        int room = doc["room"];
        const char* mode = doc["mode"];
        
        if (room >= 1 && room <= ROOM_COUNT) {
          int idx = room - 1;
          
          if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
            // Chuyển đổi Mode
            if (strcmp(mode, "AUTO") == 0) {
              rooms[idx].mode = AUTO;
              Serial.printf("[MQTT] R%d chuyen sang AUTO\n", room);
            } else if (strcmp(mode, "MANUAL") == 0) {
              rooms[idx].mode = MANUAL;
              Serial.printf("[MQTT] R%d chuyen sang MANUAL\n", room);
            }
            
            // Điều khiển MANUAL Actuators (Chỉ có tác dụng khi ở MANUAL)
            if (rooms[idx].mode == MANUAL) {
              if (doc.containsKey("buzzer")) {
                executeBuzzerControl(idx, doc["buzzer"]);
              }
              if (doc.containsKey("window")) {
                executeWindowControl(idx, doc["window"]);
              }
            }
            xSemaphoreGive(dataMutex);
          }
        }
      }
    }
  }
}

/* ================= MQTT CONNECT ================= */
void mqttReconnect() {
  while (!client.connected()) {
    Serial.println("[MQTT] Dang ket noi len Server HiveMQ...");
    String clientId = "ESP32_";
    clientId += String(WiFi.macAddress()); 

    if (client.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("[MQTT] -> KET NOI THANH CONG!");
      client.subscribe("air/control");
    } else {
      Serial.print("[MQTT] -> That bai, state=");
      Serial.print(client.state()); 
      Serial.println(". Thu lai sau 3 giay...");
      vTaskDelay(3000 / portTICK_PERIOD_MS); 
    }
  }
}

/* ================= TASK: MQTT (Ưu tiên 1) ================= */
void taskMQTT(void *pv) {
  StaticJsonDocument<512> doc;
  char buffer[512];
  unsigned long lastPublish = 0;

  for (;;) {
    mqttReconnect();
    client.loop(); 

    if (millis() - lastPublish > 3000) { 
      if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
        doc.clear();
        JsonArray arr = doc.createNestedArray("rooms");

        for (int i = 0; i < ROOM_COUNT; i++) {
          JsonObject r = arr.createNestedObject();
          r["id"] = i + 1;
          r["value"] = rooms[i].raw;
          r["level"] = rooms[i].level;
          r["mode"] = (rooms[i].mode == AUTO) ? "AUTO" : "MANUAL";
          r["sensor"] = rooms[i].error ? "ERR" : "OK";
          
          r["buzzer"] = rooms[i].buzzer;
          r["window"] = rooms[i].windowAngle;
        }
        serializeJson(doc, buffer);
        xSemaphoreGive(dataMutex);

        Serial.println("[MQTT] Dang gui du lieu len Server...");
        if(client.publish("air/data", buffer)) {
            Serial.println("[MQTT] -> GUI THANH CONG!");
        } else {
            Serial.println("[MQTT] -> GUI THAT BAI!");
        }
      }
      lastPublish = millis();
    }
    vTaskDelay(50 / portTICK_PERIOD_MS); 
  }
}

/* ================= OTA LOGIC ================= */
void performOTAUpdate(String version) {
  Serial.printf("\n🚀 Starting OTA Update to version %s...\n", version.c_str());
  
  disableCore0WDT();
  disableCore1WDT();

  HTTPClient http;
  String url = String(OTA_SERVER_URL) + "/api/firmware/download/" + version;
  
  http.begin(url);
  
  const char* headerKeys[] = {"X-MD5", "Content-Length"};
  http.collectHeaders(headerKeys, 2);
  
  int httpCode = http.GET();
  
  if (httpCode != 200) {
    Serial.printf("❌ Download failed: HTTP %d\n", httpCode);
    http.end();
    return;
  }
  
  int contentLength = http.getSize();
  String md5Header = http.header("X-MD5");
  
  Serial.printf("📦 Firmware size: %d bytes\n", contentLength);
  Serial.printf("🔐 Expected MD5: %s\n", md5Header.c_str());
  
  if (contentLength <= 0) {
    Serial.println("❌ Invalid content length");
    http.end();
    return;
  }
  
  if (!Update.begin(contentLength)) {
    Serial.println("❌ Not enough space for OTA");
    http.end();
    return;
  }
  
  WiFiClient* stream = http.getStreamPtr();
  MD5Builder md5;
  md5.begin();
  
  size_t written = 0;
  uint8_t buff[128];
  
  while (http.connected() && written < contentLength) {
    size_t availableSize = stream->available();
    if (availableSize) {
      int bytesRead = stream->readBytes(buff, min(availableSize, sizeof(buff)));
      written += Update.write(buff, bytesRead);
      md5.add(buff, bytesRead);
      
      int progress = (written * 100) / contentLength;
      Serial.printf("\r⏳ Progress: %d%% (%d/%d bytes)", progress, written, contentLength);
    }
    delay(1);
  }
  Serial.println();
  
  md5.calculate();
  String calculatedMD5 = md5.toString();
  
  if (calculatedMD5 != md5Header) {
    Serial.println("❌ MD5 verification failed!");
    Serial.printf("Expected: %s\n", md5Header.c_str());
    Serial.printf("Calculated: %s\n", calculatedMD5.c_str());
    Update.abort();
    http.end();
    return;
  }
  
  Serial.println("✅ MD5 verification passed!");
  
  if (Update.end(true)) {
    Serial.println("✅ OTA Update successful!");
    Serial.println("🔄 Rebooting in 3 seconds...");
    delay(3000);
    ESP.restart();
  } else {
    Serial.println("❌ OTA Update failed!");
    Serial.println(Update.errorString());
  }
  
  http.end();
}

/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);
  dataMutex = xSemaphoreCreateMutex();
  
  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init();
  lcd.backlight();

  connectWiFi();

  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov"); 
  Serial.print("[TIME] Dang dong bo NTP...");
  time_t now = time(nullptr);
  int retry = 0;
  while (now < 8 * 3600 * 2 && retry < 20) { 
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    retry++;
  }
  Serial.println("\n[TIME] Da dong bo thoi gian!");

  espClient.setInsecure(); 
  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(mqttCallback);
  client.setBufferSize(1024);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  for (int i = 0; i < ROOM_COUNT; i++) {
    // Buzzer
    pinMode(buzzerPins[i], OUTPUT);
    digitalWrite(buzzerPins[i], LOW);
    
    // Servo
    windowServos[i].setPeriodHertz(50); 
    windowServos[i].attach(servoPins[i], 500, 2400); 
    windowServos[i].write(0); 

    // Mặc định biến Room
    rooms[i].mode = AUTO;
    rooms[i].level = "    ";
    rooms[i].windowAngle = 0;
    rooms[i].buzzer = false;
  }

  Serial.println("\n[SYSTEM] KHOI DONG FREE-RTOS TASKS...");
  
  xTaskCreate(taskSensor,  "Sensor",  4096, NULL, 4, NULL); 
  xTaskCreate(taskControl, "Control", 4096, NULL, 3, &controlTaskHandle); 
  xTaskCreate(taskLCD,     "LCD",     4096, NULL, 2, NULL); 
  xTaskCreate(taskMQTT,    "MQTT",    8192, NULL, 1, NULL); 
}

/* ================= LOOP ================= */
void loop() {
  if (flagStartOTA) {
    flagStartOTA = false;
    performOTAUpdate(targetOTAVersion);
  }

  vTaskDelay(1000 / portTICK_PERIOD_MS); 
}
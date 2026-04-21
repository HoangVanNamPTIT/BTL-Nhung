#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

/* ================= WIFI ================= */
#define WIFI_SSID     "TP-Link_4142"
#define WIFI_PASSWORD "88202143"

/* ================= MQTT ================= */
#define MQTT_SERVER   "21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USERNAME "nhung1"
#define MQTT_PASSWORD "12345Nhung"
#define CLIENT_ID     "ESP32_RTOS_1"

/* ================= LCD ================= */
#define SDA_PIN 26
#define SCL_PIN 27
LiquidCrystal_I2C lcd(0x27, 16, 2);

/* ================= SYSTEM ================= */
#define ROOM_COUNT 2
const int adcPins[ROOM_COUNT]   = {32, 33};
const int relayPins[ROOM_COUNT] = {12, 13};

#define MQ_MIN 50
#define MQ_MAX 3800

enum Mode { AUTO, MANUAL };

/* ================= ROOM MODEL ================= */
struct Room {
  int raw;
  float filtered;
  bool error;
  bool fan;
  Mode mode;
  const char* level;
};

Room rooms[ROOM_COUNT];

/* ================= SYNC (RTOS MUTEX) ================= */
SemaphoreHandle_t dataMutex;
volatile bool flagResetLCD = false;

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

/* ================= LEVEL ================= */
const char* getLevel(int v) {
  if (v < 1200) return "GOOD";
  if (v < 2000) return "MOD ";
  if (v < 3000) return "BAD ";
  return "DANG";
}

/* ================= RELAY ================= */
void executeFanControl(int i, bool state) {
  if (rooms[i].fan != state) { 
    digitalWrite(relayPins[i], state ? HIGH : LOW);
    rooms[i].fan = state;
    Serial.printf("[RELAY] -> Da CHUYEN TRANG THAI Quat Phong %d thanh %s\n", i + 1, state ? "ON" : "OFF");
    
    // Đánh dấu yêu cầu task LCD phải khởi tạo lại màn hình
    flagResetLCD = true; 
  }
}

/* ================= TASK: SENSOR (Ưu tiên 3) ================= */
void taskSensor(void *pv) {
  float alpha = 0.2;
  for (;;) {
    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      for (int i = 0; i < ROOM_COUNT; i++) {
        int raw = analogRead(adcPins[i]);
        if (rooms[i].filtered == 0) rooms[i].filtered = raw;
        else rooms[i].filtered = alpha * raw + (1 - alpha) * rooms[i].filtered;

        rooms[i].raw = (int)rooms[i].filtered;
        rooms[i].error = (rooms[i].raw < MQ_MIN || rooms[i].raw > MQ_MAX);
        rooms[i].level = getLevel(rooms[i].raw);
        
        Serial.printf("[SENSOR] R%d raw=%d level=%s\n", i + 1, rooms[i].raw, rooms[i].level);
      }
      xSemaphoreGive(dataMutex);
    }
    vTaskDelay(1000 / portTICK_PERIOD_MS); 
  }
}

/* ================= TASK: CONTROL (Ưu tiên 2) ================= */
void taskControl(void *pv) {
  for (;;) {
    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      for (int i = 0; i < ROOM_COUNT; i++) {
        
        // Log báo hiệu task Control vẫn đang sống và làm việc
        Serial.printf("[CONTROL] R%d dang kiem tra (Mode:%s)...\n", 
                      i + 1, rooms[i].mode == AUTO ? "AUTO" : "MANUAL");

        if (rooms[i].mode == MANUAL) continue; 

        if (strcmp(rooms[i].level, "BAD ") == 0 || strcmp(rooms[i].level, "DANG") == 0) {
          executeFanControl(i, true);
        } else {
          executeFanControl(i, false);
        }
      }
      xSemaphoreGive(dataMutex);
    }
    vTaskDelay(1500 / portTICK_PERIOD_MS); // Giãn thời gian kiểm tra ra để dễ nhìn log
  }
}

/* ================= TASK: LCD (Ưu tiên 1) ================= */
void taskLCD(void *pv) {
  int page = 0;
  for (;;) {
    // 1. KIỂM TRA XEM CÓ BỊ NHIỄU VÀ CẦN RESET KHÔNG
    if (flagResetLCD) {
      flagResetLCD = false;
      Serial.println("[LCD] Phat hien nhieu Relay, dang Reset lai man hinh...");
      
      Wire.end(); // Đóng I2C
      delay(50);
      Wire.begin(SDA_PIN, SCL_PIN); // Mở lại I2C
      lcd.init(); // Khởi tạo lại chip điều khiển LCD
      lcd.backlight();
      delay(100);
    }

    // 2. LẤY DỮ LIỆU
    int currentRaw = 0;
    const char* currentLevel = "    ";
    bool currentFan = false;
    Mode currentMode = AUTO;

    if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
      currentRaw = rooms[page].raw;
      currentLevel = rooms[page].level;
      currentFan = rooms[page].fan;
      currentMode = rooms[page].mode;
      xSemaphoreGive(dataMutex);
    }

    // 3. HIỂN THỊ
    Serial.printf("[LCD] Da cap nhat man hinh Phong %d\n", page + 1);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("R"); lcd.print(page + 1); lcd.print(":"); lcd.print(currentRaw); 
    lcd.print(" "); lcd.print(currentLevel);
    
    lcd.setCursor(0, 1);
    lcd.print("F:"); lcd.print(currentFan ? "ON " : "OFF");
    lcd.print(" M:"); lcd.print(currentMode == AUTO ? "A" : "M");

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
    
    if (!error && doc.containsKey("room") && doc.containsKey("mode")) {
      int room = doc["room"];
      const char* mode = doc["mode"];
      
      if (room >= 1 && room <= ROOM_COUNT) {
        int idx = room - 1;
        
        if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
          if (strcmp(mode, "AUTO") == 0) {
            rooms[idx].mode = AUTO;
          } else if (strcmp(mode, "MANUAL") == 0) {
            rooms[idx].mode = MANUAL;
          }
          
          if (doc.containsKey("fan")) {
            bool fanState = doc["fan"];
            executeFanControl(idx, fanState);
          }
          xSemaphoreGive(dataMutex);
        }
      }
    }
  }
}

/* ================= THAY ĐỔI TRONG RECONNECT ================= */
void mqttReconnect() {
  while (!client.connected()) {
    Serial.println("[MQTT] Dang ket noi len Server HiveMQ...");
    
    // 2. Tạo Client ID ngẫu nhiên bằng MAC Address của chip
    String clientId = "ESP32_";
    clientId += String(WiFi.macAddress()); 
    
    Serial.printf("[MQTT] Su dung Client ID: %s\n", clientId.c_str());

    if (client.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("[MQTT] -> KET NOI THANH CONG!");
      client.subscribe("air/control");
    } else {
      Serial.print("[MQTT] -> That bai, state=");
      Serial.print(client.state()); // Sẽ in ra mã lỗi để debug
      Serial.println(". Thu lai sau 3 giay...");
      
      // Nếu lỗi -2 quá nhiều, đôi khi cần reset nhẹ client secure
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

    if (millis() - lastPublish > 3000) { // Cứ 3 giây bắn dữ liệu 1 lần
      if (xSemaphoreTake(dataMutex, portMAX_DELAY)) {
        doc.clear();
        JsonArray arr = doc.createNestedArray("rooms");

        for (int i = 0; i < ROOM_COUNT; i++) {
          JsonObject r = arr.createNestedObject();
          r["id"] = i + 1;
          r["value"] = rooms[i].raw;
          r["level"] = rooms[i].level;
          r["fan"] = rooms[i].fan;
          r["mode"] = (rooms[i].mode == AUTO) ? "AUTO" : "MANUAL";
          r["sensor"] = rooms[i].error ? "ERR" : "OK";
        }
        serializeJson(doc, buffer);
        xSemaphoreGive(dataMutex);

        Serial.println("[MQTT] Dang gui du lieu len Server...");
        if(client.publish("air/data", buffer)) {
            Serial.println("[MQTT] -> Gui THAMH CONG!");
        } else {
            Serial.println("[MQTT] -> GUI THAT BAI!");
        }
      }
      lastPublish = millis();
    }
    vTaskDelay(50 / portTICK_PERIOD_MS); 
  }
}

/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);
  dataMutex = xSemaphoreCreateMutex();
  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init();
  lcd.backlight();

  connectWiFi();

  // 1. Cấu hình NTP và ĐỢI cho đến khi lấy được thời gian
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov"); 
  Serial.print("[TIME] Dang dong bo NTP...");
  
  time_t now = time(nullptr);
  int retry = 0;
  while (now < 8 * 3600 * 2 && retry < 20) { // Đợi tối đa 10s để lấy giờ
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    retry++;
  }
  Serial.println("\n[TIME] Da dong bo thoi gian thanh cong!");

  espClient.setInsecure(); // Vẫn giữ Insecure để bỏ qua xác thực file .crt thủ công
  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(mqttCallback);
  client.setBufferSize(1024);

  for (int i = 0; i < ROOM_COUNT; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], LOW);
    rooms[i].mode = AUTO;
    rooms[i].level = "    ";
  }

  Serial.println("\n[SYSTEM] KHOI DONG FREE-RTOS TASKS...");

  xTaskCreate(taskSensor,  "Sensor",  4096, NULL, 3, NULL);
  xTaskCreate(taskControl, "Control", 4096, NULL, 2, NULL);
  xTaskCreate(taskLCD,     "LCD",     4096, NULL, 1, NULL);
  xTaskCreate(taskMQTT,    "MQTT",    8192, NULL, 1, NULL);
}

/* ================= LOOP ================= */
void loop() {
  vTaskDelay(1000 / portTICK_PERIOD_MS); 
}
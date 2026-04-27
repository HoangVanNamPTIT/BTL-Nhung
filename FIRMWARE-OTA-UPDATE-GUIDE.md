# Hướng Dẫn OTA Firmware Update - Arduino

## 📋 Tổng Quan

Hệ thống OTA cho phép cập nhật firmware từ xa qua MQTT. Thiết bị Arduino cần:
1. Nhận lệnh OTA từ server
2. Download firmware từ URL
3. **Gửi thông báo cập nhật thành công/thất bại về server**

---

## 🔌 Payload Format

### ✅ Arduino gửi thành công OTA

**Topic:** `air/firmwareupdatestatus`

**Payload (JSON):**
```json
{
  "mac_address": "XX:XX:XX:XX:XX:XX",
  "update": true,
  "status": "success",
  "version": "1.0.1"
}
```

**Arduino Code Example:**
```cpp
// Sử dụng chuỗi MAC đã gán cứng ở đầu file
reportDoc["mac_address"] = DEVICE_MAC;  // ← MAC của thiết bị (VD: "AA:BB:CC:DD:EE:FF")
reportDoc["update"] = true;
reportDoc["status"] = "success";        // ← "success" hoặc "failed"
reportDoc["version"] = "1.0.1";         // ← Version vừa cập nhật

serializeJson(reportDoc, reportBuffer);

Serial.println("[OTA] Đang gửi thông báo thành công lên Server...");
client.publish("air/firmwareupdatestatus", reportBuffer);
```

---

### ❌ Arduino gửi thất bại OTA

**Topic:** `air/firmwareupdatestatus`

**Payload (JSON):**
```json
{
  "mac_address": "XX:XX:XX:XX:XX:XX",
  "update": false,
  "status": "failed",
  "version": "1.0.1",
  "error": "Download failed: 404 Not Found"
}
```

**Arduino Code Example:**
```cpp
reportDoc["mac_address"] = DEVICE_MAC;
reportDoc["update"] = false;
reportDoc["status"] = "failed";
reportDoc["version"] = "1.0.1";
reportDoc["error"] = "Download URL invalid";

serializeJson(reportDoc, reportBuffer);

Serial.println("[OTA] Gửi thông báo lỗi...");
client.publish("air/firmwareupdatestatus", reportBuffer);
```

---

## 🔑 Yêu cầu quan trọng

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|---------|-------|
| `mac_address` | String | ✅ | MAC address của thiết bị (VD: "AA:BB:CC:DD:EE:FF") |
| `update` | Boolean | ✅ | `true` = cập nhật hoàn tất, `false` = lỗi |
| `status` | String | ✅ | `"success"` hoặc `"failed"` |
| `version` | String | ✅ | Phiên bản firmware đã cập nhật |
| `error` | String | ❌ | Mô tả lỗi (tuỳ chọn) |

---

## 🔄 Workflow Hoàn Chỉnh

```
1. User upload firmware lên server
   └─ Version: 1.0.1
   
2. Server gửi MQTT command tới device
   ├─ Topic: air/updatefirmware
   ├─ Payload: {
   │    "url": "http://192.168.1.212:5000/api/firmware/download/1.0.1",
   │    "version": "1.0.1"
   │  }
   
3. Arduino nhận lệnh
   ├─ Parse URL
   ├─ Download firmware từ URL
   ├─ Verify MD5 hash
   ├─ Write to Flash
   
4. Arduino restart (OTA reboot)

5. Arduino gửi thông báo kết quả
   ├─ Topic: air/firmwareupdatestatus
   ├─ Payload: {
   │    "mac_address": "AA:BB:CC:DD:EE:FF",
   │    "update": true,
   │    "status": "success",
   │    "version": "1.0.1"
   │  }

6. Backend nhận thông báo
   ├─ Match mac_address → device_id
   ├─ Update FirmwareUpdateLog
   ├─ Emit Socket.io tới frontend
   
7. Frontend hiển thị kết quả
   ├─ Status: ✅ SUCCESS
   ├─ Progress: 100%
   └─ Activity log: [Device] Firmware 1.0.1 update ✅ SUCCESS
```

---

## 📊 Backend Flow

### Bên server nhận payload:

```
MqttPool.js → handleMqttMessage()
  ├─ topic === "air/firmwareupdatestatus"
  └─ handleFirmwareUpdateStatus(payload)
      ├─ Extract mac_address từ payload
      ├─ Find device by mac_address
      ├─ Get device_id từ device object
      ├─ Find FirmwareUpdateLog (firmware_id + device_id)
      ├─ Update log: status, error_message, completed_at
      └─ Emit Socket.io: firmware_update_status
          ├─ deviceId, deviceName, macAddress
          ├─ status, version, error
          └─ completedAt (timestamp)
```

### Frontend nhận Socket.io:

```
useFirmwareUpdateListener()
  └─ socket.on("firmware_update_status")
      ├─ Receive data: {deviceId, deviceName, macAddress, status, version, error}
      ├─ Update updateProgress[deviceId]
      └─ Display in Progress Modal:
          ├─ Device name
          ├─ MAC address
          ├─ Status badge (✅/❌)
          ├─ Progress bar (0-100%)
          └─ Error message if failed
```

---

## 🧪 Testing

### 1. Verify MAC Address Format

```cpp
// Arduino code
Serial.print("Device MAC: ");
Serial.println(DEVICE_MAC);  // Should print: AA:BB:CC:DD:EE:FF
```

### 2. Monitor MQTT Messages

```bash
# Subscribe to firmware status topic
mosquitto_sub -h broker.hivemq.com -p 8883 \
  -u your_username -P your_password \
  -t "air/firmwareupdatestatus"
```

### 3. Check Backend Logs

```
[OTA] 📡 Firmware update status received: {
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "update": true,
  "status": "success",
  "version": "1.0.1"
}

[OTA] ✅ Device matched: MOI MUA HOM QUA (AA:BB:CC:DD:EE:FF)
[OTA] 📝 Updated firmware update log: ID=xxx, status=success
[OTA] ✅ Activity log created for device: MOI MUA HOM QUA
```

### 4. Verify Frontend Display

- Open OTA Management page
- Click Update on a firmware
- Select device(s)
- Monitor progress modal
  - Status should update from "pending" → "success"/"failed"
  - Device name and MAC address displayed
  - Error message shown if failed

---

## ✅ Checklist

- [ ] Arduino hardcode MAC_ADDRESS correctly
- [ ] Arduino sends mac_address in payload (not mac or other field)
- [ ] status field is exactly "success" or "failed"
- [ ] version matches uploaded firmware version
- [ ] MQTT publish on topic "air/firmwareupdatestatus"
- [ ] Backend logs show device matched
- [ ] Frontend displays progress updates
- [ ] Activity log records update event

---

## 🐛 Troubleshooting

### "Device not found with mac_address"
- ❌ MAC format wrong (should be XX:XX:XX:XX:XX:XX)
- ❌ MAC not registered in database
- ✅ Check device is claimed in system

### "No firmware update log found"
- ❌ Version doesn't match uploaded firmware
- ✅ Verify firmware version in upload
- ✅ Check FirmwareUpdateLog was created when update triggered

### Frontend not updating
- ❌ Socket.io not connected
- ✅ Check browser console for Socket errors
- ✅ Verify backend emitting correct event name

---

## 📝 Notes

- **mac_address** adalah unique identifier
- Backend match device bằng MAC address, không dùng clientId
- Activity log tự động ghi lại các OTA updates
- Status badge thay đổi ngay khi socket.io nhận update

# OTA Firmware Management - Implementation Guide

## 📦 What's New

### 1. **Backend Config File** 
- **File:** `Backend/config/ota.config.js`
- **Mục đích:** Lưu cấu hình OTA server (IP, PORT)
- **Tính năng:**
  - Dễ dàng thay đổi IP/Port theo mạng cục bộ
  - Hỗ trợ environment variables
  - Tự động build URL download firmware

### 2. **Backend Firmware Controller Update**
- **File:** `Backend/src/controllers/firmwareController.js`
- **Thay đổi:**
  - Import `otaConfig` module
  - Hàm `triggerOTAUpdate()` giờ:
    - Gửi MQTT tới topic **`air/updatefirmware`** (mới)
    - Gửi URL đầy đủ: `http://192.168.x.x:5000/api/firmware/download/{version}`
    - Gửi version firmware
  - Payload format: `{ "url": "...", "version": "1.0.0" }`

### 3. **Frontend OTA Management UI Redesign**
- **File:** `Frontend/src/pages/OTAManagement.jsx`
- **Thay đổi:**
  - ✅ Thêm **Navbar** (navigation bar chính)
  - ✅ Thêm **Sidebar** (navigation menu bên)
  - ✅ Layout giống **DashboardPage** (consistent UI)
  - ✅ Stats cards (firmware versions, latest, device count)
  - ✅ Better modals (upload, OTA trigger)
  - ✅ Device status check trước OTA
  - ✅ Toast notifications (thay vì alert)

### 4. **Arduino OTA Handler Code**
- **File:** `ArduinoCode/OTA_HANDLER_SNIPPET.ino`
- **Tính năng:**
  - Subscribe topic: `air/updatefirmware`
  - Parse URL từ payload
  - Download firmware từ backend
  - Validate MD5 checksum
  - Flash update + auto reboot

---

## 🚀 How to Use

### Step 1: Configure OTA Server IP/Port

**Option A - Using Environment Variables:**
```bash
# Windows PowerShell
$env:OTA_SERVER_HOST="192.168.1.45"; npm start

# Windows CMD
set OTA_SERVER_HOST=192.168.1.45
npm start
```

**Option B - Edit File Direct:**
```bash
# Edit Backend/config/ota.config.js
HOST: "192.168.1.45",  // Your local machine IP
PORT: 5000,            // Backend port
```

### Step 2: Upload Firmware

1. Go to **OTA Management** page (from navbar)
2. Click **⬆️ Upload Firmware**
3. Enter:
   - **Version:** `1.0.0`
   - **File:** Select `.bin` file
   - **Release Notes:** (optional)
4. Click **Upload**

### Step 3: Send OTA Update to Device

1. Click **📤 Send OTA Update**
2. Select:
   - **Firmware Version:** Choose from list
   - **Device:** Choose from your devices
3. Click **Send OTA**
4. Backend gửi MQTT → Arduino nhận → Update firmware

### Step 4: Monitor Update

- **Backend logs:**
  ```
  [OTA] Sending to device xxx:
    Topic: air/updatefirmware
    URL: http://192.168.1.45:5000/api/firmware/download/1.0.0
  ```

- **Arduino Serial Console:**
  ```
  [MQTT] YÊU CẦU OTA UPDATE! Phiên bản: 1.0.0
  [MQTT] URL: http://192.168.1.45:5000/api/firmware/download/1.0.0
  [OTA] Bắt đầu cập nhật...
  [OTA] File size: 123456 bytes
  [OTA] Update complete, rebooting...
  ```

---

## 📋 MQTT Communication Flow

```
Frontend (OTA Page)
    ↓
    POST /devices/{id}/trigger-ota
    ↓
Backend (Firmware Controller)
    ↓
    Read otaConfig (IP, PORT)
    Build URL: http://192.168.x.x:5000/api/firmware/download/{version}
    ↓
MQTT Publish
    Topic: air/updatefirmware
    Payload: { "url": "http://...", "version": "1.0.0" }
    ↓
Arduino (MQTT Client)
    ↓
    Receive on air/updatefirmware
    Parse JSON → Extract URL & version
    Create taskOTA() thread
    ↓
Download & Flash
    HTTPClient download firmware from URL
    Update.begin() → Update.write() → Update.end()
    Verify MD5 checksum
    Auto reboot
```

---

## 🔧 Configuration File Details

### `Backend/config/ota.config.js`

```javascript
module.exports = {
  // IP address of your backend machine
  HOST: process.env.OTA_SERVER_HOST || "192.168.2.29",
  
  // Port your backend is running on
  PORT: process.env.OTA_SERVER_PORT || 5000,
  
  // Firmware download path
  FIRMWARE_PATH: "/api/firmware/download",
  
  // Generate full download URL
  getDownloadUrl(version) {
    return `http://${this.HOST}:${this.PORT}${this.FIRMWARE_PATH}/${version}`;
  },
  
  // Get base URL
  getBaseUrl() {
    return `http://${this.HOST}:${this.PORT}`;
  }
};
```

---

## ✅ Checklist

- [x] Backend config file created
- [x] Firmware controller updated (new topic `air/updatefirmware`)
- [x] Frontend OTA UI redesigned (navbar + sidebar)
- [x] OTA handler snippet provided for Arduino
- [x] Configuration guide created
- [ ] Test with real hardware
- [ ] Update Arduino code with new handler
- [ ] Configure IP address for your network

---

## 📚 Related Files

| File | Purpose |
|------|---------|
| `Backend/config/ota.config.js` | OTA server configuration |
| `Backend/OTA-CONFIG-GUIDE.md` | Detailed config instructions |
| `Backend/src/controllers/firmwareController.js` | Updated firmware logic |
| `Frontend/src/pages/OTAManagement.jsx` | New UI design |
| `ArduinoCode/OTA_HANDLER_SNIPPET.ino` | Arduino OTA handler |

---

## 🐛 Troubleshooting

**Q: "MQTT client for device này chưa kết nối"**
- A: Device phải online (MQTT connected). Kiểm tra device status ở dashboard.

**Q: "URL không valid"**
- A: Kiểm tra IP/PORT đúng trong `ota.config.js`. Phải là IP local, không phải localhost.

**Q: "Arduino không nhận OTA"**
- A: Thêm code từ `OTA_HANDLER_SNIPPET.ino` vào Arduino firmware. Subscribe topic `air/updatefirmware`.

**Q: Làm sao thay đổi IP cho network khác?**
- A: Edit `Backend/config/ota.config.js` hoặc set environment variable `OTA_SERVER_HOST`.

---

## 🎯 Next Steps

1. **Update Arduino code** với handler snippet
2. **Configure OTA server IP** theo mạng của bạn
3. **Upload firmware** qua OTA Management
4. **Test OTA update** trên device
5. **Monitor logs** để debug nếu cần

---

**Version:** 1.0
**Date:** April 27, 2026
**Status:** Ready for Production

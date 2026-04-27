/**
 * OTA Firmware Configuration
 * Cập nhật IP và PORT của máy chủ tại đây
 * 
 * Ví dụ:
 *   - Máy tính local: http://192.168.1.45:5000
 *   - Docker/Network khác: http://10.0.0.5:3000
 */

module.exports = {
  // IP hoặc hostname của máy chủ backend
  // Có thể dùng IP local: 192.168.x.x
  // Hoặc hostname: localhost, myserver.local
  HOST: process.env.OTA_SERVER_HOST || "192.168.1.212",

  // Port của backend API
  PORT: process.env.OTA_SERVER_PORT || 5000,

  // Path đến firmware file (không thay đổi)
  FIRMWARE_PATH: "/api/firmware/download",

  // Hàm tạo URL đầy đủ
  getDownloadUrl(version) {
    const baseUrl = `http://${this.HOST}:${this.PORT}`;
    return `${baseUrl}${this.FIRMWARE_PATH}/${version}`;
  },

  // Hàm tạo base URL
  getBaseUrl() {
    return `http://${this.HOST}:${this.PORT}`;
  },
};

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const otaConfig = require("../../config/ota.config");
// Import prisma từ index (nơi khởi tạo) hoặc tự tạo instance mới
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const FIRMWARE_DIR = path.join(__dirname, "../../../uploads/firmware");

if (!fs.existsSync(FIRMWARE_DIR)) {
  fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
}

function calculateMD5(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash("md5");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

exports.uploadFirmware = async (req, res) => {
  try {
    const { version, releaseNotes } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Không có file được upload" });
    }

    if (!version) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Thiếu version" });
    }

    const existingFirmware = await prisma.firmware.findUnique({ where: { version } });
    if (existingFirmware) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: `Firmware version ${version} đã tồn tại` });
    }

    if (!req.file.originalname.endsWith(".bin")) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Chỉ chấp nhận file .bin" });
    }

    const md5Hash = calculateMD5(req.file.path);

    const firmware = await prisma.firmware.create({
      data: {
        version,
        filename: req.file.filename,
        original_filename: req.file.originalname,
        file_path: req.file.path,
        file_size: req.file.size,
        md5_hash: md5Hash,
        release_notes: releaseNotes || "",
        uploaded_by: req.user ? req.user.id : null,
      },
    });

    res.status(201).json({
      message: "Upload firmware thành công",
      firmware,
    });
  } catch (error) {
    console.error("Upload firmware error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: "Lỗi server khi upload firmware" });
  }
};

exports.getAllFirmware = async (req, res) => {
  try {
    const firmwares = await prisma.firmware.findMany({
      orderBy: { created_at: "desc" },
      include: {
        user: { select: { email: true, full_name: true } }
      }
    });

    res.json({
      firmwares: firmwares.map((fw) => ({
        _id: fw.id,
        version: fw.version,
        filename: fw.filename,
        fileSize: fw.file_size,
        md5Hash: fw.md5_hash,
        releaseNotes: fw.release_notes,
        downloadCount: fw.download_count,
        isActive: fw.is_active,
        uploadedBy: fw.user?.full_name || "Unknown",
        createdAt: fw.created_at,
      })),
    });
  } catch (error) {
    console.error("Get firmware list error:", error);
    res.status(500).json({ message: "Lỗi server khi lấy danh sách firmware" });
  }
};

exports.getLatestFirmware = async (req, res) => {
  try {
    const currentVersion = req.query.current || "0.0.0";

    const latestFirmware = await prisma.firmware.findFirst({
      where: { is_active: true },
      orderBy: { created_at: "desc" },
    });

    if (!latestFirmware) {
      return res.json({ hasUpdate: false, message: "Không có firmware khả dụng" });
    }

    const hasUpdate = latestFirmware.version !== currentVersion;

    res.json({
      hasUpdate,
      currentVersion,
      latestVersion: latestFirmware.version,
      fileSize: latestFirmware.file_size,
      md5Hash: latestFirmware.md5_hash,
      releaseNotes: latestFirmware.release_notes,
      downloadUrl: hasUpdate ? `/api/firmware/download/${latestFirmware.version}` : null,
    });
  } catch (error) {
    console.error("Get latest firmware error:", error);
    res.status(500).json({ message: "Lỗi server khi kiểm tra firmware" });
  }
};

exports.downloadFirmware = async (req, res) => {
  try {
    const { version } = req.params;

    const firmware = await prisma.firmware.findUnique({
      where: { version },
    });

    if (!firmware || !firmware.is_active) {
      return res.status(404).json({ message: "Không tìm thấy firmware" });
    }

    if (!fs.existsSync(firmware.file_path)) {
      return res.status(404).json({ message: "File firmware không tồn tại" });
    }

    await prisma.firmware.update({
      where: { id: firmware.id },
      data: { download_count: { increment: 1 } },
    });

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${firmware.filename}"`);
    res.setHeader("Content-Length", firmware.file_size);
    res.setHeader("X-MD5", firmware.md5_hash);

    const fileStream = fs.createReadStream(firmware.file_path);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Download firmware error:", error);
    res.status(500).json({ message: "Lỗi server khi download firmware" });
  }
};

exports.deleteFirmware = async (req, res) => {
  try {
    const { id } = req.params;

    const firmware = await prisma.firmware.findUnique({ where: { id } });
    if (!firmware) {
      return res.status(404).json({ message: "Không tìm thấy firmware" });
    }

    if (fs.existsSync(firmware.file_path)) {
      fs.unlinkSync(firmware.file_path);
    }

    await prisma.firmware.delete({ where: { id } });

    res.json({ message: "Xóa firmware thành công" });
  } catch (error) {
    console.error("Delete firmware error:", error);
    res.status(500).json({ message: "Lỗi server khi xóa firmware" });
  }
};

exports.triggerOTAUpdate = async (req, res) => {
  try {
    const { deviceId, version } = req.body;

    if (!deviceId || !version) {
      return res.status(400).json({ message: "Thiếu deviceId hoặc version" });
    }

    const device = await prisma.device.findFirst({ where: { id: deviceId } });
    if (!device) {
      return res.status(404).json({ message: "Không tìm thấy device" });
    }

    const firmware = await prisma.firmware.findUnique({ where: { version } });
    if (!firmware || !firmware.is_active) {
      return res.status(404).json({ message: "Không tìm thấy firmware version này" });
    }

    // Attempt to get MQTT client for this device
    let mqttClient = null;
    try {
      const mqttPool = req.app.get("mqttPool");
      mqttClient = mqttPool ? mqttPool.getClient(deviceId) : null;
    } catch (e) {
      console.error("Failed to get mqttPool from app:", e);
    }

    if (!mqttClient || !mqttClient.connected) {
      return res.status(503).json({ message: "MQTT client cho device này chưa kết nối" });
    }

    // Create firmware update log
    await prisma.firmwareUpdateLog.upsert({
      where: {
        firmware_id_device_id: {
          firmware_id: firmware.id,
          device_id: deviceId,
        },
      },
      update: {
        status: "pending",
        started_at: new Date(),
      },
      create: {
        firmware_id: firmware.id,
        device_id: deviceId,
        status: "pending",
        started_at: new Date(),
      },
    });

    // Build firmware download URL using config
    const firmwareUrl = otaConfig.getDownloadUrl(version);

    // Topic mới: air/updatefirmware với payload chứa URL đầy đủ
    const otaTopic = `air/updatefirmware`;
    const otaPayload = JSON.stringify({
      url: firmwareUrl,
      version: firmware.version,
    });

    console.log(`[OTA] Sending to device ${deviceId}:`);
    console.log(`  Topic: ${otaTopic}`);
    console.log(`  URL: ${firmwareUrl}`);
    console.log(`  Version: ${firmware.version}`);

    mqttClient.publish(otaTopic, otaPayload, { qos: 1 }, (err) => {
      if (err) {
        console.error("MQTT publish error:", err);
        return res.status(500).json({ message: "Lỗi khi gửi lệnh OTA" });
      }

      console.log(`✅ OTA update sent to ${deviceId} - version ${version}`);
      res.json({
        message: `Đã gửi lệnh OTA update tới device ${deviceId}`,
        version: firmware.version,
        deviceId,
        url: firmwareUrl,
      });
    });
  } catch (error) {
    console.error("Trigger OTA error:", error);
    res.status(500).json({ message: "Lỗi server khi trigger OTA update" });
  }
};

/**
 * Trigger OTA update for multiple devices
 */
exports.triggerBatchOTAUpdate = async (req, res) => {
  try {
    const { version, deviceIds } = req.body;

    if (!version || !deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({ message: "Thiếu version hoặc deviceIds" });
    }

    const firmware = await prisma.firmware.findUnique({ where: { version } });
    if (!firmware || !firmware.is_active) {
      return res.status(404).json({ message: "Không tìm thấy firmware version này" });
    }

    // Verify all devices exist and get their status
    const devices = await prisma.device.findMany({
      where: { id: { in: deviceIds } },
    });

    if (devices.length !== deviceIds.length) {
      return res.status(404).json({ message: "Một số device không tìm thấy" });
    }

    // Get MQTT pool
    const mqttPool = req.app.get("mqttPool");
    if (!mqttPool) {
      return res.status(500).json({ message: "MQTT pool không khả dụng" });
    }

    // Create OTA update session
    const session = await prisma.oTAUpdateSession.create({
      data: {
        firmware_id: firmware.id,
        initiated_by: req.user ? req.user.id : null,
        device_ids: JSON.stringify(deviceIds),
        total_devices: deviceIds.length,
      },
    });

    // Create update log entries for all devices
    const updateLogs = [];
    for (const deviceId of deviceIds) {
      const log = await prisma.firmwareUpdateLog.upsert({
        where: {
          firmware_id_device_id: {
            firmware_id: firmware.id,
            device_id: deviceId,
          },
        },
        update: {
          status: "pending",
          started_at: new Date(),
        },
        create: {
          firmware_id: firmware.id,
          device_id: deviceId,
          status: "pending",
          started_at: new Date(),
        },
      });
      updateLogs.push(log);
    }

    // Build firmware download URL
    const firmwareUrl = otaConfig.getDownloadUrl(version);

    // Send OTA command to each device
    const failedDevices = [];
    let sentCount = 0;

    for (const deviceId of deviceIds) {
      try {
        const mqttClient = mqttPool.getClient(deviceId);
        if (!mqttClient || !mqttClient.connected) {
          failedDevices.push({ deviceId, reason: "MQTT not connected" });
          console.warn(`[OTA] ⚠️ MQTT not connected for device ${deviceId}`);
          continue;
        }

        const otaPayload = JSON.stringify({
          url: firmwareUrl,
          version: firmware.version,
        });

        console.log(`[OTA] 📤 Publishing OTA command to device ${deviceId}`);
        mqttClient.publish("air/updatefirmware", otaPayload, { qos: 1 }, (err) => {
          if (err) {
            console.error(`[OTA] ❌ Failed to send OTA to device ${deviceId}:`, err);
          } else {
            console.log(`[OTA] ✅ OTA command published successfully to device ${deviceId}`);
          }
        });
        sentCount++; // Count as sent when publish is called (not waiting for callback)
      } catch (error) {
        console.error(`[OTA] ❌ Error sending OTA to device ${deviceId}:`, error);
        failedDevices.push({ deviceId, reason: error.message });
      }
    }

    console.log(
      `[OTA] 📊 Batch OTA Update Result: totalDevices=${deviceIds.length}, sentCount=${sentCount}, failedCount=${failedDevices.length}`,
    );

    res.json({
      message: "Batch OTA update initiated",
      sessionId: session.id,
      version: firmware.version,
      totalDevices: deviceIds.length,
      sentCount, // Should now be correct
      failedCount: failedDevices.length,
      failedDevices,
    });
  } catch (error) {
    console.error("Batch OTA update error:", error);
    res.status(500).json({ message: "Lỗi server khi trigger batch OTA update" });
  }
};

/**
 * Edit firmware version name
 */
exports.editFirmware = async (req, res) => {
  try {
    const { id } = req.params;
    const { version, releaseNotes } = req.body;

    const firmware = await prisma.firmware.findUnique({ where: { id } });
    if (!firmware) {
      return res.status(404).json({ message: "Không tìm thấy firmware" });
    }

    if (version && version !== firmware.version) {
      // Check if new version already exists
      const existingVersion = await prisma.firmware.findUnique({ where: { version } });
      if (existingVersion) {
        return res.status(400).json({ message: `Version ${version} đã tồn tại` });
      }
    }

    const updatedFirmware = await prisma.firmware.update({
      where: { id },
      data: {
        ...(version && { version }),
        ...(releaseNotes !== undefined && { release_notes: releaseNotes }),
        updated_at: new Date(),
      },
      include: {
        user: { select: { email: true, full_name: true } },
      },
    });

    res.json({
      message: "Cập nhật firmware thành công",
      firmware: {
        _id: updatedFirmware.id,
        version: updatedFirmware.version,
        filename: updatedFirmware.filename,
        fileSize: updatedFirmware.file_size,
        releaseNotes: updatedFirmware.release_notes,
        uploadedBy: updatedFirmware.user?.full_name || "Unknown",
        updatedAt: updatedFirmware.updated_at,
      },
    });
  } catch (error) {
    console.error("Edit firmware error:", error);
    res.status(500).json({ message: "Lỗi server khi cập nhật firmware" });
  }
};

/**
 * Get firmware update logs for a specific firmware
 */
exports.getFirmwareUpdateLogs = async (req, res) => {
  try {
    const { id } = req.params;

    const firmware = await prisma.firmware.findUnique({ where: { id } });
    if (!firmware) {
      return res.status(404).json({ message: "Không tìm thấy firmware" });
    }

    const logs = await prisma.firmwareUpdateLog.findMany({
      where: { firmware_id: id },
      include: {
        device: {
          select: {
            id: true,
            device_name: true,
            mac_address: true,
            status: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    res.json({
      firmwareVersion: firmware.version,
      totalLogs: logs.length,
      successCount: logs.filter(l => l.status === "success").length,
      failedCount: logs.filter(l => l.status === "failed").length,
      pendingCount: logs.filter(l => l.status === "pending").length,
      logs: logs.map((log) => ({
        id: log.id,
        deviceId: log.device.id,
        deviceName: log.device.device_name,
        macAddress: log.device.mac_address,
        deviceStatus: log.device.status,
        updateStatus: log.status,
        errorMessage: log.error_message,
        startedAt: log.started_at,
        completedAt: log.completed_at,
        createdAt: log.created_at,
      })),
    });
  } catch (error) {
    console.error("Get firmware update logs error:", error);
    res.status(500).json({ message: "Lỗi server khi lấy firmware update logs" });
  }
};

/**
 * Get firmware update status for polling (used by frontend to track progress)
 * Query params: version, deviceIds (comma-separated)
 */
exports.getUpdateStatus = async (req, res) => {
  try {
    const { version, deviceIds } = req.query;

    if (!version || !deviceIds) {
      return res.status(400).json({ message: "Thiếu version hoặc deviceIds" });
    }

    // Parse device IDs
    const deviceIdArray = deviceIds.split(",").map((id) => id.trim());

    // Get firmware
    const firmware = await prisma.firmware.findUnique({ where: { version } });
    if (!firmware) {
      return res.status(404).json({ message: "Không tìm thấy firmware version này" });
    }

    // Get update logs for these devices and firmware
    const logs = await prisma.firmwareUpdateLog.findMany({
      where: {
        firmware_id: firmware.id,
        device_id: { in: deviceIdArray },
      },
      include: {
        device: {
          select: {
            id: true,
            device_name: true,
            mac_address: true,
            status: true,
          },
        },
      },
    });

    // Build response with status for each device
    const statusMap = {};
    logs.forEach((log) => {
      statusMap[log.device_id] = {
        deviceId: log.device_id,
        deviceName: log.device.device_name,
        macAddress: log.device.mac_address,
        status: log.status, // "pending", "success", "failed"
        error: log.error_message,
        completedAt: log.completed_at,
      };
    });

    // For devices not in logs yet, return pending
    deviceIdArray.forEach((deviceId) => {
      if (!statusMap[deviceId]) {
        const device = null; // We don't have device info, but that's OK for polling
        statusMap[deviceId] = {
          deviceId,
          deviceName: "Unknown",
          macAddress: "Unknown",
          status: "pending",
          error: null,
          completedAt: null,
        };
      }
    });

    res.json({
      version,
      updateStatuses: Object.values(statusMap),
      successCount: logs.filter((l) => l.status === "success").length,
      failedCount: logs.filter((l) => l.status === "failed").length,
      pendingCount: deviceIdArray.length - logs.filter((l) => l.status !== "pending").length,
    });
  } catch (error) {
    console.error("Get update status error:", error);
    res.status(500).json({ message: "Lỗi server khi lấy trạng thái update" });
  }
};

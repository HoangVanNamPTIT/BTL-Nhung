const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

    const otaTopic = `air/control`; // Topic của Arduino mới
    const otaPayload = JSON.stringify({
      mode: "UPDATE",
      version: firmware.version,
    });

    mqttClient.publish(otaTopic, otaPayload, { qos: 1 }, (err) => {
      if (err) {
        console.error("MQTT publish error:", err);
        return res.status(500).json({ message: "Lỗi khi gửi lệnh OTA" });
      }

      console.log(`✅ OTA trigger sent to ${deviceId} on topic air/control - version ${version}`);
      res.json({
        message: `Đã gửi lệnh OTA update tới device ${deviceId}`,
        version: firmware.version,
        deviceId,
      });
    });
  } catch (error) {
    console.error("Trigger OTA error:", error);
    res.status(500).json({ message: "Lỗi server khi trigger OTA update" });
  }
};

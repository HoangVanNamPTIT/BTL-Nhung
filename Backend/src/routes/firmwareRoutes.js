const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth"); // Cần middleware verifyToken, bạn có thể bỏ qua nếu chưa cần auth

const firmwareController = require("../controllers/firmwareController");

// Setup multer storage cho upload file .bin
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "../../../uploads/firmware");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "firmware-" + uniqueSuffix + ".bin");
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith(".bin")) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ hỗ trợ file .bin"));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Routes
router.post("/upload", upload.single("firmwareFile"), firmwareController.uploadFirmware);
router.get("/", firmwareController.getAllFirmware);
router.get("/latest", firmwareController.getLatestFirmware);
router.get("/download/:version", firmwareController.downloadFirmware);
router.delete("/:id", firmwareController.deleteFirmware);
router.post("/trigger-update", firmwareController.triggerOTAUpdate);

module.exports = router;

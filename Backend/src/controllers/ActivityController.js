const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

class ActivityController {
  /**
   * Get activity logs for a user
   */
  static async getUserActivity(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 100 } = req.query;

      // Verify user can only view their own activity
      if (userId !== req.user.id) {
        return res.status(403).json({
          error: "Unauthorized",
        });
      }

      const logs = await prisma.activityLog.findMany({
        where: {
          user_id: userId,
        },
        orderBy: { timestamp: "desc" },
        take: parseInt(limit),
        include: {
          device: {
            select: {
              id: true,
              device_name: true,
            },
          },
        },
      });

      res.json({
        user_id: userId,
        activity_logs: logs,
      });
    } catch (error) {
      console.error("Get user activity error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Get activity logs for a device
   */
  static async getDeviceActivity(req, res) {
    try {
      const { deviceId } = req.params;
      const { limit = 100 } = req.query;

      // Verify user has access to device
      const userDevice = await prisma.userDevice.findFirst({
        where: {
          device_id: deviceId,
          user_id: req.user.id,
        },
      });

      if (!userDevice) {
        return res.status(404).json({
          error: "Device not found",
        });
      }

      const logs = await prisma.activityLog.findMany({
        where: {
          device_id: deviceId,
        },
        orderBy: { timestamp: "desc" },
        take: parseInt(limit),
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              email: true,
            },
          },
        },
      });

      res.json({
        device_id: deviceId,
        activity_logs: logs,
      });
    } catch (error) {
      console.error("Get device activity error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Get all activity logs for the user (across all their devices)
   */
  static async getAllActivity(req, res) {
    try {
      const { limit = 100 } = req.query;

      // Get all devices accessed by user through UserDevice
      const userDevices = await prisma.userDevice.findMany({
        where: {
          user_id: req.user.id,
        },
        select: {
          device_id: true,
        },
      });

      const deviceIds = userDevices.map((ud) => ud.device_id);

      // Get all activity logs for these devices
      const logs = await prisma.activityLog.findMany({
        where: {
          device_id: {
            in: deviceIds,
          },
        },
        orderBy: { timestamp: "desc" },
        take: parseInt(limit),
        include: {
          device: {
            select: {
              id: true,
              device_name: true,
            },
          },
          user: {
            select: {
              id: true,
              full_name: true,
            },
          },
        },
      });

      res.json({
        user_id: req.user.id,
        total_devices: deviceIds.length,
        activity_logs: logs,
      });
    } catch (error) {
      console.error("Get all activity error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }
}

module.exports = ActivityController;

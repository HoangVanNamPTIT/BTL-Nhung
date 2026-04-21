const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class TelemetryController {
  /**
   * Get latest telemetry data for a room
   */
  static async getLatestData(req, res) {
    try {
      const { roomId } = req.params;

      // Get room with device info
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          device: {
            select: {
              owner_id: true
            }
          }
        }
      });

      if (!room) {
        return res.status(404).json({
          error: 'Room not found'
        });
      }

      // Verify ownership
      if (room.device.owner_id !== req.user.id) {
        return res.status(403).json({
          error: 'Unauthorized'
        });
      }

      // Get latest telemetry data
      const data = await prisma.telemetryData.findFirst({
        where: { room_id: roomId },
        orderBy: { timestamp: 'desc' }
      });

      res.json({
        room_id: roomId,
        room_name: room.room_name,
        latest: data || null
      });
    } catch (error) {
      console.error('Get latest data error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get historical telemetry data for a room
   */
  static async getHistoricalData(req, res) {
    try {
      const { roomId } = req.params;
      const { hours = 24, limit = 500 } = req.query;

      // Get room with device info
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          device: {
            select: {
              owner_id: true
            }
          }
        }
      });

      if (!room) {
        return res.status(404).json({
          error: 'Room not found'
        });
      }

      // Verify ownership
      if (room.device.owner_id !== req.user.id) {
        return res.status(403).json({
          error: 'Unauthorized'
        });
      }

      // Get historical data
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const data = await prisma.telemetryData.findMany({
        where: {
          room_id: roomId,
          timestamp: {
            gte: since
          }
        },
        orderBy: { timestamp: 'asc' },
        take: parseInt(limit)
      });

      // Calculate statistics
      const aqi_values = data.map(d => d.aqi_raw);
      const stats = {
        min: aqi_values.length > 0 ? Math.min(...aqi_values) : null,
        max: aqi_values.length > 0 ? Math.max(...aqi_values) : null,
        avg: aqi_values.length > 0 ? (aqi_values.reduce((a, b) => a + b, 0) / aqi_values.length).toFixed(2) : null,
        count: aqi_values.length
      };

      res.json({
        room_id: roomId,
        room_name: room.room_name,
        hours: parseInt(hours),
        stats,
        data
      });
    } catch (error) {
      console.error('Get historical data error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
}

module.exports = TelemetryController;

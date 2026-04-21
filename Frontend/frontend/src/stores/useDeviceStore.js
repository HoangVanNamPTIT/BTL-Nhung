import { create } from 'zustand';
import api from '../utils/api';

export const useDeviceStore = create((set, get) => ({
  devices: [],
  activities: [],
  isLoading: false,
  error: null,

  // Fetch all devices
  fetchDevices: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/devices');
      set({ devices: response.data, isLoading: false });
      return response.data;
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to fetch devices';
      set({ error: message, isLoading: false });
      return [];
    }
  },

  // Update device with new telemetry data
  updateDeviceTelemetry: (deviceId, telemetryData) => {
    set((state) => ({
      devices: state.devices.map((device) =>
        device.id === deviceId
          ? {
              ...device,
              rooms: telemetryData.rooms || device.rooms,
            }
          : device
      ),
    }));

    // Add activity log
    const { activities } = get();
    set({
      activities: [
        ...activities,
        {
          message: `Device ${deviceId} updated`,
          timestamp: new Date(),
        },
      ],
    });
  },

  // Add new device
  addDevice: async (deviceData) => {
    try {
      const response = await api.post('/devices', deviceData);
      set((state) => ({
        devices: [...state.devices, response.data],
      }));
      return { success: true, device: response.data };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to add device';
      return { success: false, error: message };
    }
  },

  // Send control command
  sendControl: async (deviceId, room, mode, fan) => {
    try {
      await api.post('/devices/control', {
        deviceId,
        room,
        mode,
        fan,
      });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to send control';
      return { success: false, error: message };
    }
  },

  // Add activity
  addActivity: (message) => {
    set((state) => ({
      activities: [
        ...state.activities,
        {
          message,
          timestamp: new Date(),
        },
      ],
    }));
  },

  // Clear activities
  clearActivities: () => {
    set({ activities: [] });
  },
}));

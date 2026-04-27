import { create } from "zustand";
import api from "../utils/api";

const clampTrend = (points = []) => points.slice(-20);

const levelLabel = (level = "GOOD") => String(level).trim().toUpperCase();

const mapRoomFromApi = (room) => {
  const telemetry = [...(room.telemetry_data || [])].reverse();
  const latest = telemetry[telemetry.length - 1];

  return {
    id: room.id,
    roomIndex: room.room_index,
    roomName: room.room_name,
    mode: room.current_mode,
    fan: room.current_fan_status,
    sensor: latest?.sensor || "OK",
    value: latest?.aqi_raw ?? 0,
    level: levelLabel(latest?.aqi_level),
    trend: clampTrend(
      telemetry.map((item, idx) => ({ index: idx, value: item.aqi_raw })),
    ),
  };
};

const mapDeviceFromApi = (device) => ({
  id: device.id,
  macAddress: device.mac_address,
  name: device.device_name,
  status: device.status,
  lastConnected: device.last_connected,
  rooms: (device.rooms || []).map(mapRoomFromApi),
});

const toActivityItem = (log) => ({
  id: `${log.id || Math.random().toString(36).slice(2)}-${Date.now()}`,
  message: log.description,
  eventType: log.event_type,
  timestamp: log.timestamp || new Date().toISOString(),
  deviceId: log.device_id,
  deviceName: log.device?.device_name || "Unknown Device",
});

export const useDeviceStore = create((set, get) => ({
  devices: [],
  activities: [],
  isLoading: false,
  error: null,

  fetchDevices: async () => {
    console.log("[Store] 📱 Fetching devices...");
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/devices");
      const devices = (response.data?.devices || []).map(mapDeviceFromApi);
      console.log("[Store] ✅ Devices fetched:", devices);
      set({ devices, isLoading: false });
      return devices;
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to fetch devices";
      console.error("[Store] ❌ Error fetching devices:", message);
      set({ error: message, isLoading: false });
      return [];
    }
  },

  fetchActivities: async () => {
    console.log("[Store] 📋 Fetching activities...");
    try {
      const response = await api.get("/activity", { params: { limit: 100 } });
      const logs = response.data?.activity_logs || [];
      console.log("[Store] ✅ Activities fetched:", logs.length, "logs");
      // Reverse to show newest at bottom
      set({ activities: logs.map(toActivityItem).reverse() });
      return logs;
    } catch (err) {
      console.error("[Store] ❌ Error fetching activities:", err.message);
      return [];
    }
  },

  verifyClaim: async (mac_address, claim_pin) => {
    try {
      const response = await api.post("/devices/verify-claim", {
        mac_address,
        claim_pin,
      });
      return { success: true, device: response.data?.device };
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Verification failed";
      return { success: false, error: message };
    }
  },

  claimDevice: async ({ mac_address, claim_pin, device_name, rooms }) => {
    try {
      const response = await api.post("/devices/claim", {
        mac_address,
        claim_pin,
        device_name,
        rooms,
      });

      const claimed = mapDeviceFromApi(response.data?.device);
      set((state) => ({
        devices: [...state.devices, claimed],
      }));

      return { success: true, device: claimed };
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to claim device";
      return { success: false, error: message };
    }
  },

  applyTelemetryUpdate: (payload) => {
    console.log("[Store] 📊 Applying telemetry update:", payload);
    const incomingRooms = payload?.rooms || [];

    set((state) => ({
      devices: state.devices.map((device) => {
        if (device.id !== payload?.deviceId) {
          return device;
        }

        const updatedRooms = device.rooms.map((room) => {
          const matched = incomingRooms.find(
            (entry) =>
              entry.roomId === room.id ||
              Number(entry.id) === Number(room.roomIndex),
          );

          if (!matched) {
            return room;
          }

          const nextTrend = clampTrend([
            ...room.trend,
            {
              index: room.trend.length,
              value: matched.value,
            },
          ]);

          console.log(
            `[Store] 📊 Updated ${room.roomName}: AQI=${matched.value}, Level=${matched.level}`,
          );

          return {
            ...room,
            mode: matched.mode || room.mode,
            fan: typeof matched.fan === "boolean" ? matched.fan : room.fan,
            sensor: matched.sensor || room.sensor,
            value: matched.value ?? room.value,
            level: levelLabel(matched.level || room.level),
            trend: nextTrend.map((point, idx) => ({ ...point, index: idx })),
          };
        });

        return {
          ...device,
          rooms: updatedRooms,
        };
      }),
    }));
  },

  sendControl: async ({ deviceId, room, mode, fan }) => {
    try {
      await api.post("/devices/control", { deviceId, room, mode, fan });
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to send control";
      return { success: false, error: message };
    }
  },

  setRoomMode: async (deviceId, roomId, mode) => {
    console.log(
      `[Store] 🎛️ setRoomMode called: deviceId=${deviceId}, roomId=${roomId}, mode=${mode}`,
    );
    const currentDevices = get().devices;
    const activeDevice = currentDevices.find(
      (device) => device.id === deviceId,
    );
    const activeRoom = activeDevice?.rooms.find((room) => room.id === roomId);

    if (!activeRoom) {
      console.error("[Store] ❌ Room not found");
      return { success: false, error: "Room not found" };
    }

    set((state) => ({
      devices: state.devices.map((device) =>
        device.id !== deviceId
          ? device
          : {
              ...device,
              rooms: device.rooms.map((room) =>
                room.id === roomId ? { ...room, mode } : room,
              ),
            },
      ),
    }));

    try {
      console.log("[Store] 🔄 Sending control command to API...");
      await api.post("/devices/control", {
        deviceId,
        room: activeRoom.roomIndex,
        mode,
        fan: activeRoom.fan,
      });
      console.log("[Store] ✅ Mode updated successfully");
      return { success: true };
    } catch (err) {
      console.error("[Store] ❌ Mode update failed:", err.message);
      set({ devices: currentDevices });
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to update mode";
      return { success: false, error: message };
    }
  },

  setRoomFan: async (deviceId, roomId, fan) => {
    console.log(
      `[Store] 💨 setRoomFan called: deviceId=${deviceId}, roomId=${roomId}, fan=${fan}`,
    );
    const currentDevices = get().devices;
    const activeDevice = currentDevices.find(
      (device) => device.id === deviceId,
    );
    const activeRoom = activeDevice?.rooms.find((room) => room.id === roomId);

    if (!activeRoom) {
      console.error("[Store] ❌ Room not found");
      return { success: false, error: "Room not found" };
    }

    if (activeRoom.mode === "AUTO") {
      console.error("[Store] ❌ Cannot control fan in AUTO mode");
      return { success: false, error: "Switch to MANUAL to control" };
    }

    set((state) => ({
      devices: state.devices.map((device) =>
        device.id !== deviceId
          ? device
          : {
              ...device,
              rooms: device.rooms.map((room) =>
                room.id === roomId ? { ...room, fan } : room,
              ),
            },
      ),
    }));

    try {
      console.log("[Store] 🔄 Sending control command to API...");
      await api.post("/devices/control", {
        deviceId,
        room: activeRoom.roomIndex,
        mode: activeRoom.mode,
        fan,
      });
      console.log("[Store] ✅ Fan toggled successfully");
      return { success: true };
    } catch (err) {
      console.error("[Store] ❌ Fan toggle failed:", err.message);
      set({ devices: currentDevices });
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to update fan";
      return { success: false, error: message };
    }
  },

  setRoomWindow: async (deviceId, roomId, window) => {
    console.log(
      `[Store] 🪟 setRoomWindow called: deviceId=${deviceId}, roomId=${roomId}, window=${window}`,
    );
    const currentDevices = get().devices;
    const activeDevice = currentDevices.find(
      (device) => device.id === deviceId,
    );
    const activeRoom = activeDevice?.rooms.find((room) => room.id === roomId);

    if (!activeRoom) {
      console.error("[Store] ❌ Room not found");
      return { success: false, error: "Room not found" };
    }

    if (activeRoom.mode === "AUTO") {
      console.error("[Store] ❌ Cannot control window in AUTO mode");
      return { success: false, error: "Switch to MANUAL to control" };
    }

    set((state) => ({
      devices: state.devices.map((device) =>
        device.id !== deviceId
          ? device
          : {
              ...device,
              rooms: device.rooms.map((room) =>
                room.id === roomId ? { ...room, window } : room,
              ),
            },
      ),
    }));

    try {
      console.log("[Store] 🔄 Sending window control command to API...");
      await api.post("/devices/control", {
        deviceId,
        room: activeRoom.roomIndex,
        mode: activeRoom.mode,
        fan: activeRoom.fan,
        window,
      });
      console.log("[Store] ✅ Window adjusted successfully");
      return { success: true };
    } catch (err) {
      console.error("[Store] ❌ Window control failed:", err.message);
      set({ devices: currentDevices });
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to update window";
      return { success: false, error: message };
    }
  },

  setRoomBuzzer: async (deviceId, roomId, buzzer) => {
    console.log(
      `[Store] 🔔 setRoomBuzzer called: deviceId=${deviceId}, roomId=${roomId}, buzzer=${buzzer}`,
    );
    const currentDevices = get().devices;
    const activeDevice = currentDevices.find(
      (device) => device.id === deviceId,
    );
    const activeRoom = activeDevice?.rooms.find((room) => room.id === roomId);

    if (!activeRoom) {
      console.error("[Store] ❌ Room not found");
      return { success: false, error: "Room not found" };
    }

    if (activeRoom.mode === "AUTO") {
      console.error("[Store] ❌ Cannot control buzzer in AUTO mode");
      return { success: false, error: "Switch to MANUAL to control" };
    }

    set((state) => ({
      devices: state.devices.map((device) =>
        device.id !== deviceId
          ? device
          : {
              ...device,
              rooms: device.rooms.map((room) =>
                room.id === roomId ? { ...room, buzzer } : room,
              ),
            },
      ),
    }));

    try {
      console.log("[Store] 🔄 Sending buzzer control command to API...");
      await api.post("/devices/control", {
        deviceId,
        room: activeRoom.roomIndex,
        mode: activeRoom.mode,
        fan: activeRoom.fan,
        buzzer,
      });
      console.log("[Store] ✅ Buzzer toggled successfully");
      return { success: true };
    } catch (err) {
      console.error("[Store] ❌ Buzzer toggle failed:", err.message);
      set({ devices: currentDevices });
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to update buzzer";
      return { success: false, error: message };
    }
  },

  appendActivity: (activity) => {
    set((state) => {
      const devices = state.devices;
      const device = devices.find(
        (d) => d.id === (activity.deviceId || activity.device_id),
      );
      const deviceName =
        device?.name || activity.deviceName || "Unknown Device";

      console.log(
        `[Store] 📝 Appending activity: ${activity.eventType} - ${activity.description || activity.message}`,
      );

      return {
        activities: [
          ...state.activities,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            message:
              activity.description || activity.message || "System update",
            eventType: activity.eventType || activity.event_type || "INFO",
            timestamp: activity.timestamp || new Date().toISOString(),
            deviceId: activity.deviceId || activity.device_id,
            deviceName: deviceName,
          },
        ].slice(-150),
      };
    });
  },

  clearActivities: () => {
    set({ activities: [] });
  },

  updateDeviceStatus: (deviceId, newStatus) => {
    console.log(
      `[Store] 🔄 Updating device ${deviceId} status to ${newStatus}`,
    );
    set((state) => ({
      devices: state.devices.map((device) =>
        device.id === deviceId ? { ...device, status: newStatus } : device,
      ),
    }));
  },

  removeDevice: (deviceId) => {
    console.log(`[Store] 🗑️ Removing device ${deviceId}`);
    set((state) => ({
      devices: state.devices.filter((device) => device.id !== deviceId),
    }));
  },
}));

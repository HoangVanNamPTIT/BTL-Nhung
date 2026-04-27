import { useDeviceStore } from "../stores/useDeviceStore";

export const useDevice = () => {
  const {
    devices,
    activities,
    isLoading,
    error,
    fetchDevices,
    fetchActivities,
    verifyClaim,
    claimDevice,
    setRoomMode,
    setRoomFan,
    setRoomWindow,
    setRoomBuzzer,
    sendControl,
    applyTelemetryUpdate,
    appendActivity,
    clearActivities,
    updateDeviceStatus,
    removeDevice,
  } = useDeviceStore();

  return {
    devices,
    activities,
    isLoading,
    error,
    fetchDevices,
    fetchActivities,
    verifyClaim,
    claimDevice,
    setRoomMode,
    setRoomFan,
    setRoomWindow,
    setRoomBuzzer,
    sendControl,
    applyTelemetryUpdate,
    appendActivity,
    clearActivities,
    updateDeviceStatus,
    removeDevice,
  };
};

import { useDeviceStore } from '../stores/useDeviceStore';

export const useDevice = () => {
  const {
    devices,
    activities,
    isLoading,
    error,
    fetchDevices,
    updateDeviceTelemetry,
    addDevice,
    sendControl,
    addActivity,
    clearActivities,
  } = useDeviceStore();

  return {
    devices,
    activities,
    isLoading,
    error,
    fetchDevices,
    updateDeviceTelemetry,
    addDevice,
    sendControl,
    addActivity,
    clearActivities,
  };
};

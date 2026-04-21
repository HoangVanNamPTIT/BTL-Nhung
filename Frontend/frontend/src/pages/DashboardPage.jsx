import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../components/common";
import { DeviceSection, OnboardingWizardModal } from "../components/dashboard";
import { ActivityFeed, Navbar, Sidebar } from "../components/layout";
import { Spinner } from "../components/common";
import { useDevice } from "../hooks/useDevice";
import { createSocketClient } from "../utils/socket";

const DashboardPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const {
    devices,
    isLoading,
    error,
    fetchDevices,
    fetchActivities,
    verifyClaim,
    claimDevice,
    setRoomMode,
    setRoomFan,
    applyTelemetryUpdate,
    appendActivity,
    updateDeviceStatus,
  } = useDevice();

  useEffect(() => {
    fetchDevices();
    fetchActivities();
  }, [fetchDevices, fetchActivities]);

  const socketRef = useRef(null);

  const handleTelemetryUpdate = useCallback(
    (payload) => {
      console.log("[Socket] 📊 telemetry_update received:", payload);
      applyTelemetryUpdate(payload);
    },
    [applyTelemetryUpdate],
  );

  const handleActivityLog = useCallback(
    (activity) => {
      console.log("[Socket] 📝 activity_log received:", activity);
      appendActivity(activity);

      // Update device status directly without re-fetching all devices
      if (
        activity.eventType === "DEVICE_OFFLINE" ||
        activity.eventType === "DEVICE_ONLINE"
      ) {
        const newStatus =
          activity.eventType === "DEVICE_OFFLINE" ? "OFFLINE" : "ONLINE";
        console.log(
          `[Socket] 🔄 Device status changed to ${newStatus}, updating UI...`,
        );
        updateDeviceStatus(activity.deviceId, newStatus);
      }
    },
    [appendActivity, updateDeviceStatus],
  );

  const handleConnect = useCallback(() => {
    console.log("[Socket] 🟢 Connected to realtime server");
    appendActivity({
      eventType: "SOCKET_CONNECTED",
      description: "Connected to realtime server",
    });
    fetchDevices();
  }, [appendActivity, fetchDevices]);

  const handleDisconnect = useCallback(() => {
    console.log("[Socket] 🔴 Disconnected from realtime server");
    appendActivity({
      eventType: "SOCKET_DISCONNECTED",
      description: "Realtime disconnected, switching to API fallback sync",
    });
  }, [appendActivity]);

  const handleConnectError = useCallback(() => {
    console.error("[Socket] ⚠️ Connection error");
    appendActivity({
      eventType: "SOCKET_CONNECT_ERROR",
      description: "Realtime channel unstable, using API fallback sync",
    });
  }, [appendActivity]);

  // Initialize socket connection once
  useEffect(() => {
    if (socketRef.current) return;

    const socket = createSocketClient();
    console.log(
      "[Socket] 🔌 Creating socket client, connecting to:",
      socket.io.uri,
    );
    socketRef.current = socket;

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("telemetry_update", handleTelemetryUpdate);
    socket.on("activity_log", handleActivityLog);
    socket.on("connect_error", handleConnectError);

    return () => {
      console.log("[Socket] 🔌 Cleaning up socket connection");
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("telemetry_update", handleTelemetryUpdate);
      socket.off("activity_log", handleActivityLog);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    handleConnect,
    handleDisconnect,
    handleTelemetryUpdate,
    handleActivityLog,
    handleConnectError,
  ]);

  // Separate fallback polling timer
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (socketRef.current && !socketRef.current.connected) {
        fetchDevices();
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [fetchDevices]);

  const hasDevices = useMemo(() => devices.length > 0, [devices]);

  const handleModeChange = async (deviceId, roomId, mode) => {
    console.log(
      `[Action] 🎛️ Changing mode - deviceId=${deviceId}, roomId=${roomId}, mode=${mode}`,
    );
    const result = await setRoomMode(deviceId, roomId, mode);
    if (!result.success) {
      console.error("[Action] ❌ Mode change failed:", result.error);
      toast.error(result.error || "Failed to update mode");
      return;
    }

    console.log("[Action] ✅ Mode changed successfully");
    toast.success(`Mode switched to ${mode}`);
  };

  const handleFanChange = async (deviceId, roomId, fan) => {
    console.log(
      `[Action] 💨 Toggling fan - deviceId=${deviceId}, roomId=${roomId}, fan=${fan}`,
    );
    const result = await setRoomFan(deviceId, roomId, fan);
    if (!result.success) {
      console.error("[Action] ❌ Fan toggle failed:", result.error);
      toast.error(result.error || "Failed to toggle fan");
      return;
    }

    console.log("[Action] ✅ Fan toggled successfully");
    toast.success(`Fan turned ${fan ? "ON" : "OFF"}`);
  };

  const handleVerify = async ({ mac_address, claim_pin }) => {
    return verifyClaim(mac_address, claim_pin);
  };

  const handleComplete = async ({
    mac_address,
    claim_pin,
    device_name,
    rooms,
  }) => {
    const result = await claimDevice({
      mac_address,
      claim_pin,
      device_name,
      rooms,
    });

    if (result.success) {
      appendActivity({
        eventType: "DEVICE_CLAIMED",
        description: `Device ${result.device?.name || "Smart Home"} claimed successfully`,
      });
    }

    return result;
  };

  return (
    <div className="min-h-screen bg-app-gradient">
      <Navbar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />

      <div className="mx-auto flex w-full max-w-[1440px] gap-4 px-4 py-4 lg:px-6">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onAddDevice={() => setWizardOpen(true)}
        />

        <main className="min-w-0 flex-1 space-y-6 md:ml-64">
          <header className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Multi-room Air Quality
            </p>
            <h2 className="text-3xl font-bold text-slate-900">
              Device-centric Dashboard
            </h2>
            <p className="text-sm text-slate-600">
              Live AQI telemetry, control modes, and fan status per room.
            </p>
          </header>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white/80">
              <Spinner size="lg" />
            </div>
          ) : !hasDevices ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 py-14 text-center">
              <p className="text-lg font-medium text-slate-700">
                No devices yet.
              </p>
              <p className="text-sm text-slate-500">
                Click Add Device to start the onboarding wizard.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {devices.map((device) => (
                <DeviceSection
                  key={device.id}
                  device={device}
                  onModeChange={handleModeChange}
                  onFanChange={handleFanChange}
                  onDeviceUpdate={fetchDevices}
                />
              ))}
            </div>
          )}

          {/* Temporarily disabled activity feed */}
          {/* <ActivityFeed /> */}
        </main>
      </div>

      <OnboardingWizardModal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onVerify={handleVerify}
        onComplete={handleComplete}
      />
    </div>
  );
};

export default DashboardPage;

import { memo, useState, useCallback } from "react";
import { toast } from "../common";
import RoomCard from "./RoomCard";
import api from "../../utils/api";

const DeviceSection = memo(
  ({ device, onModeChange, onFanChange, onWindowChange, onBuzzerChange, onDeviceUpdate }) => {
    const isOnline = device.status === "ONLINE";
    const [editingDeviceName, setEditingDeviceName] = useState(false);
    const [newDeviceName, setNewDeviceName] = useState(device.name);
    const [editingRoomNames, setEditingRoomNames] = useState(false);
    const [roomNames, setRoomNames] = useState(
      device.rooms.map((r) => ({ id: r.id, name: r.roomName })),
    );
    const [isLoading, setIsLoading] = useState(false);

    const handleSaveDeviceName = useCallback(async () => {
      if (!newDeviceName.trim()) {
        toast.error("Device name cannot be empty");
        return;
      }

      setIsLoading(true);
      try {
        await api.put(`/devices/${device.id}/settings`, {
          device_name: newDeviceName,
        });
        toast.success("Device name updated");
        setEditingDeviceName(false);
        if (onDeviceUpdate) onDeviceUpdate();
      } catch (error) {
        toast.error(
          error.response?.data?.error || "Failed to update device name",
        );
        setNewDeviceName(device.name);
      } finally {
        setIsLoading(false);
      }
    }, [newDeviceName, device.id, onDeviceUpdate]);

    const handleSaveRoomNames = useCallback(async () => {
      if (roomNames.some((r) => !r.name.trim())) {
        toast.error("Room names cannot be empty");
        return;
      }

      setIsLoading(true);
      try {
        await api.put(`/devices/${device.id}/settings`, {
          rooms: roomNames.map((r) => ({ id: r.id, room_name: r.name })),
        });
        toast.success("Room names updated");
        setEditingRoomNames(false);
        if (onDeviceUpdate) onDeviceUpdate();
      } catch (error) {
        toast.error(
          error.response?.data?.error || "Failed to update room names",
        );
        setRoomNames(device.rooms.map((r) => ({ id: r.id, name: r.roomName })));
      } finally {
        setIsLoading(false);
      }
    }, [roomNames, device.id, onDeviceUpdate]);

    const handleDisconnect = useCallback(async () => {
      if (!window.confirm(`Disconnect device "${device.name}"?`)) return;

      setIsLoading(true);
      try {
        await api.post(`/devices/${device.id}/disconnect`);
        toast.success("Device disconnected");
        if (onDeviceUpdate) onDeviceUpdate();
      } catch (error) {
        toast.error(
          error.response?.data?.error || "Failed to disconnect device",
        );
      } finally {
        setIsLoading(false);
      }
    }, [device.id, device.name, onDeviceUpdate]);

    const handleReconnect = useCallback(async () => {
      setIsLoading(true);
      try {
        await api.post(`/devices/${device.id}/reconnect`);
        toast.success("Device reconnected");
        if (onDeviceUpdate) onDeviceUpdate();
      } catch (error) {
        toast.error(
          error.response?.data?.error || "Failed to reconnect device",
        );
      } finally {
        setIsLoading(false);
      }
    }, [device.id, onDeviceUpdate]);

    const handleDelete = useCallback(async () => {
      if (!window.confirm(`Are you sure you want to delete "${device.name}"? This action cannot be undone.`)) return;

      setIsLoading(true);
      try {
        await api.delete(`/devices/${device.id}`);
        toast.success("Device deleted successfully");
        if (onDeviceUpdate) onDeviceUpdate();
      } catch (error) {
        toast.error(
          error.response?.data?.error || "Failed to delete device",
        );
      } finally {
        setIsLoading(false);
      }
    }, [device.id, device.name, onDeviceUpdate]);

    return (
      <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        {/* Device Header */}
        <header className="mb-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {editingDeviceName ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-2xl font-bold"
                    placeholder="Device name"
                    disabled={isLoading}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDeviceName}
                      disabled={isLoading}
                      className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingDeviceName(false);
                        setNewDeviceName(device.name);
                      }}
                      disabled={isLoading}
                      className="rounded-lg bg-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Device
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {device.name}
                  </h3>
                  <p className="text-sm text-slate-500">{device.macAddress}</p>
                </div>
              )}
            </div>

            <div
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
            >
              {device.status}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setEditingDeviceName(true)}
              disabled={editingDeviceName || isLoading}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              ✏️ Edit Device Name
            </button>
            <button
              onClick={() => setEditingRoomNames(true)}
              disabled={editingRoomNames || isLoading}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              ✏️ Edit Room Names
            </button>
            {isOnline ? (
              <button
                onClick={handleDisconnect}
                disabled={isLoading}
                className="rounded-lg border border-rose-300 px-3 py-1 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                ⛔ Disconnect Device
              </button>
            ) : (
              <button
                onClick={handleReconnect}
                disabled={isLoading}
                className="rounded-lg border border-emerald-300 px-3 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                🔄 Reconnect Device
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="rounded-lg border border-red-300 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              🗑️ Delete Device
            </button>
          </div>
        </header>

        {/* Room Names Editor */}
        {editingRoomNames && (
          <div className="mb-6 space-y-3 rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">
              Edit Room Names:
            </p>
            {roomNames.map((room) => (
              <input
                key={room.id}
                type="text"
                value={room.name}
                onChange={(e) =>
                  setRoomNames(
                    roomNames.map((r) =>
                      r.id === room.id ? { ...r, name: e.target.value } : r,
                    ),
                  )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Room name"
                disabled={isLoading}
              />
            ))}
            <div className="flex gap-2">
              <button
                onClick={handleSaveRoomNames}
                disabled={isLoading}
                className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingRoomNames(false);
                  setRoomNames(
                    device.rooms.map((r) => ({ id: r.id, name: r.roomName })),
                  );
                }}
                disabled={isLoading}
                className="rounded-lg bg-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Rooms Grid - Optimized for 2 rooms max */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {device.rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isOnline={isOnline}
              onModeChange={(mode) => onModeChange(device.id, room.id, mode)}
              onFanChange={(fan) => onFanChange(device.id, room.id, fan)}
              onWindowChange={(window) => onWindowChange(device.id, room.id, window)}
              onBuzzerChange={(buzzer) => onBuzzerChange(device.id, room.id, buzzer)}
            />
          ))}
        </div>
      </section>
    );
  },
);

DeviceSection.displayName = "DeviceSection";
export default DeviceSection;

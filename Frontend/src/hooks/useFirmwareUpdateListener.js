import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Socket.io connect vào root (không thêm /api)
// Ưu tiên: VITE_SOCKET_URL > window.location origin > fallback localhost:5000
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `${window.location.protocol}//${window.location.host}`;

let socketInstance = null;
let listenersRegistered = false;

/**
 * Hook để listen firmware update status từ Socket.io
 * Sử dụng singleton socket để tránh disconnect/reconnect mỗi lần render
 * @param {Function} onStatusUpdate - Callback khi có update status
 * @param {Function} onFirmwareStatus - Callback khi có firmware_update_status event
 */
export const useFirmwareUpdateListener = (onStatusUpdate, onFirmwareStatus) => {
  const onFirmwareStatusRef = useRef(onFirmwareStatus);
  const onStatusUpdateRef = useRef(onStatusUpdate);

  // Update refs mỗi khi callback thay đổi (không disconnect socket)
  useEffect(() => {
    onFirmwareStatusRef.current = onFirmwareStatus;
  }, [onFirmwareStatus]);

  useEffect(() => {
    onStatusUpdateRef.current = onStatusUpdate;
  }, [onStatusUpdate]);

  useEffect(() => {
    // Khởi tạo socket nếu chưa có
    if (!socketInstance) {
      console.log("[Socket] 🔌 Creating socket connection to", SOCKET_URL);
      socketInstance = io(SOCKET_URL, {
        path: "/socket.io/",
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
        transports: ["websocket", "polling"],
        autoConnect: true,
        forceNew: false,
      });

      socketInstance.on("connect", () => {
        console.log("[Socket] ✅ Connected to server on namespace /:", socketInstance.id);
      });

      socketInstance.on("connect_error", (error) => {
        console.error("[Socket] ❌ Connection Error:", error.message || error);
        console.error("[Socket] Error type:", error.type);
        console.error("[Socket] Error data:", error.data);
      });

      socketInstance.on("error", (error) => {
        console.error("[Socket] ❌ Socket Error:", error);
      });

      socketInstance.on("disconnect", (reason) => {
        console.log("[Socket] ⚫ Disconnected from server. Reason:", reason);
      });

      // Register listeners chỉ 1 lần (khi socket tạo)
      if (!listenersRegistered) {
        // Listen for firmware update status from device
        socketInstance.on("firmware_update_status", (data) => {
          console.log("[Socket] 🎯 firmware_update_status event RECEIVED:", data);
          if (onFirmwareStatusRef.current) {
            console.log("[Socket] ⏭️  Calling callback...");
            onFirmwareStatusRef.current(data);
          } else {
            console.warn("[Socket] ⚠️ onFirmwareStatusRef.current is null!");
          }
        });

        // Listen for telemetry updates
        socketInstance.on("telemetry_update", (data) => {
          console.log("[Socket] 📡 telemetry_update event:", data);
          if (onStatusUpdateRef.current) {
            onStatusUpdateRef.current(data);
          }
        });

        listenersRegistered = true;
        console.log("[Socket] ✅ Listeners registered PERMANENTLY");
      }

      console.log("[Socket] 🔌 Socket.io initialized, waiting for events...");
    }

    // NO cleanup - keep listeners forever
    return () => {
      // Do NOT remove listeners or disconnect socket
      // They persist for the entire app lifetime
    };
  }, []);
};

export default useFirmwareUpdateListener;

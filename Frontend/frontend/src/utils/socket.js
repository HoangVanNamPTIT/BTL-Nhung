import { io } from "socket.io-client";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const getSocketBaseUrl = () => {
  try {
    const parsed = new URL(API_BASE_URL);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "http://localhost:5000";
  }
};

export const createSocketClient = () => {
  const baseUrl = getSocketBaseUrl();
  return io(baseUrl, {
    // Force polling to avoid websocket upgrade failures in local setups.
    transports: ["polling"],
    upgrade: false,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
};

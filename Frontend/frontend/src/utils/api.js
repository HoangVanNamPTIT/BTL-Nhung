import axios from "axios";
import { useAuthStore } from "../stores/useAuthStore";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(
      `[API] ${config.method.toUpperCase()} ${config.url}`,
      config.data || {},
    );
    return config;
  },
  (error) => Promise.reject(error),
);

// Handle responses
api.interceptors.response.use(
  (response) => {
    console.log(
      `[API] Response ${response.status} ${response.config.url}`,
      response.data,
    );
    return response;
  },
  (error) => {
    console.error(
      `[API] Error ${error.response?.status || "Network"} ${error.config?.url}`,
      error.response?.data || error.message,
    );
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;

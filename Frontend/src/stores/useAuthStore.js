import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "../utils/api";

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post("/auth/login", { email, password });
          const { user, token } = response.data;
          set({ user, token, isLoading: false });
          return { success: true };
        } catch (err) {
          const message =
            err.response?.data?.error ||
            err.response?.data?.message ||
            "Login failed";
          set({ error: message, isLoading: false });
          return { success: false, error: message };
        }
      },

      register: async (email, password, full_name) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post("/auth/register", {
            email,
            password,
            full_name,
          });
          const { user, token } = response.data;
          set({ user, token, isLoading: false });
          return { success: true };
        } catch (err) {
          const message =
            err.response?.data?.error ||
            err.response?.data?.message ||
            "Registration failed";
          set({ error: message, isLoading: false });
          return { success: false, error: message };
        }
      },

      logout: () => {
        set({ user: null, token: null, error: null });
      },

      setToken: (token) => {
        set({ token });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "auth-store",
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);

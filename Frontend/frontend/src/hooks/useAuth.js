import { useAuthStore } from '../stores/useAuthStore';

export const useAuth = () => {
  const { user, token, login, register, logout, isLoading, error, clearError } = useAuthStore();

  const isAuthenticated = !!token;

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
  };
};

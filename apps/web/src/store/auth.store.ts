import { create } from 'zustand';
import { setAccessToken, setRefreshToken, clearAuth } from '@/lib/auth';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  isVerified: boolean;
}

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,

  setAuth: (user, accessToken, refreshToken) => {
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    clearAuth();
    set({ user: null, isAuthenticated: false });
  },
}));

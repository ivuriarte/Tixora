import { create } from 'zustand';
import { setAccessToken, setRefreshToken, clearAuth, getRefreshToken } from '@/lib/auth';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  isOrganizer?: boolean;
  isVerified: boolean;
}

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True while AuthHydrator is attempting to restore a session from localStorage. */
  isHydrating: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  setHydrating: (value: boolean) => void;
  logout: () => void;
}

/**
 * Initialize isHydrating only when a refresh token actually exists in storage.
 *
 * - Server-side (no window): false — SSR renders unauthenticated state instantly.
 * - Client, no token: false — unauthenticated users see the page immediately.
 * - Client, has token: true — authenticated users show a skeleton until the
 *   token refresh completes, preventing a flash of unauthenticated content.
 */
const initialIsHydrating =
  typeof window !== 'undefined' && !!getRefreshToken();

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrating: initialIsHydrating,

  setAuth: (user, accessToken, refreshToken) => {
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    set({ user, isAuthenticated: true });
  },

  setHydrating: (value) => set({ isHydrating: value }),

  logout: () => {
    clearAuth();
    set({ user: null, isAuthenticated: false });
  },
}));

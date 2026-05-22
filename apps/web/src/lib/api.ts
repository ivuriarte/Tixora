import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, setAccessToken, clearAuth, getRefreshToken } from './auth';

const api = axios.create({
  baseURL: (process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1'),
  timeout: 15_000,
  // NOTE: do NOT set a global `Content-Type` header. Axios v1 sets it
  // automatically per request: `application/json` for plain objects,
  // `multipart/form-data; boundary=…` for FormData. Forcing it here breaks
  // file uploads because the multipart boundary never makes it to the server,
  // and the backend's multer interceptor sees an empty body → "Image file is required".
  withCredentials: false,
});

// Attach access token to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

let refreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

// Refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (refreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((newToken) => {
          if (newToken) {
            original.headers['Authorization'] = `Bearer ${newToken}`;
            resolve(api(original));
          } else {
            reject(error);
          }
        });
      });
    }

    refreshing = true;

    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const res = await axios.post<{ data: { accessToken: string } }>(
        `${(process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1')}/auth/refresh`,
        { refreshToken },
      );

      const newToken = res.data.data.accessToken;
      setAccessToken(newToken);
      refreshQueue.forEach((cb) => cb(newToken));
      refreshQueue = [];

      original.headers['Authorization'] = `Bearer ${newToken}`;
      return api(original);
    } catch {
      refreshQueue.forEach((cb) => cb(null));
      refreshQueue = [];
      clearAuth();
      if (typeof window !== 'undefined') window.location.href = '/auth/login';
      return Promise.reject(error);
    } finally {
      refreshing = false;
    }
  },
);

export default api;

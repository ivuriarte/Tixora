import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, clearAuth, getLoginPortal } from './auth';
import { API_BASE_URL, SessionExpiredError, refreshSession, sessionExpiredLoginUrl } from './session';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
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

let redirectingToLogin = false;

// Refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Auth endpoints returning 401 mean wrong credentials, not an expired
    // token — skip the refresh cycle and let the caller handle the error.
    const url = original.url ?? '';
    if (url.startsWith('/auth/')) {
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      // A request sent before a refresh finished can 401 late; retry it with the newer token instead of rotating again.
      const sentToken = String(original.headers['Authorization'] ?? '').replace(/^Bearer /, '');
      const currentToken = getAccessToken();
      const accessToken =
        currentToken && currentToken !== sentToken ? currentToken : (await refreshSession()).accessToken;
      original.headers['Authorization'] = `Bearer ${accessToken}`;
      return api(original);
    } catch (refreshError) {
      if (refreshError instanceof SessionExpiredError && typeof window !== 'undefined' && !redirectingToLogin) {
        // Concurrent requests all fail together; a second navigation would reload the login page.
        redirectingToLogin = true;
        const portal = getLoginPortal();
        clearAuth();
        window.location.href = sessionExpiredLoginUrl(window.location.pathname, window.location.search, portal);
      }
      return Promise.reject(error);
    }
  },
);

export default api;

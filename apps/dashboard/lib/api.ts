const AUTH_STORAGE_KEY = 'apployd_token';
const LOCAL_API_FALLBACK = 'http://localhost:4000/api/v1';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const resolveApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_API_URL);
  }

  if (typeof window !== 'undefined') {
    return `${trimTrailingSlash(window.location.origin)}/api/v1`;
  }

  return LOCAL_API_FALLBACK;
};

export const resolveWebSocketBaseUrl = (): string => {
  const apiUrl = resolveApiUrl();
  const root = apiUrl.replace(/\/api\/v1\/?$/i, '');
  return root.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
};

const getToken = () => {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(AUTH_STORAGE_KEY) ?? '';
};

const request = async (path: string, options?: RequestInit) => {
  const token = getToken();
  const isPublicAuthPath =
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/signup') ||
    path.startsWith('/auth/github');
  const shouldSendAuth =
    Boolean(token) && !isPublicAuthPath;

  const headers = new Headers(options?.headers ?? {});
  headers.set('Content-Type', 'application/json');

  if (shouldSendAuth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${resolveApiUrl()}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && shouldSendAuth && typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      const currentPath = `${window.location.pathname}${window.location.search}`;
      const next = currentPath && currentPath !== '/' ? currentPath : '/overview';
      const onAuthPage = window.location.pathname.startsWith('/login') || window.location.pathname.startsWith('/signup');
      if (!onAuthPage) {
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    }
    throw new Error(payload.message ?? `HTTP ${response.status}`);
  }

  return payload;
};

export const apiClient = {
  get: (path: string, options?: RequestInit) => request(path, options),
  post: (path: string, body: unknown, options?: RequestInit) =>
    request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (path: string, body: unknown, options?: RequestInit) =>
    request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: (path: string, body: unknown, options?: RequestInit) =>
    request(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string, options?: RequestInit) =>
    request(path, { ...options, method: 'DELETE' }),
};

// Central API client — all calls go through Node.js backend (/api/*)
// Frontend never calls Python service directly.

const BASE_URL = '/api';

function getToken(): string | null {
  return localStorage.getItem('session_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) {
    headers['x-session-token'] = token;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  status: () => api.get<{ isSetup: boolean }>('/auth/status'),
  setup: (pin: string, language?: string, theme?: string) =>
    api.post<{ success: boolean; token: string; userId: number; language: string; theme: string }>(
      '/auth/setup',
      { pin, language, theme }
    ),
  verify: (pin: string) =>
    api.post<{ success: boolean; token: string; userId: number; language: string; theme: string }>(
      '/auth/verify',
      { pin }
    ),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<{ user: unknown; preferences: unknown }>('/auth/me'),
};

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthApi = {
  check: () => api.get('/health'),
};

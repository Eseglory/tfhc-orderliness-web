export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    if ((window as any).__NEXT_PUBLIC_API_URL__) {
      return (window as any).__NEXT_PUBLIC_API_URL__;
    }
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      // Honor explicitly configured local API ports (including isolated E2E servers).
      const configured = process.env.NEXT_PUBLIC_API_URL;
      if (configured) {
        try { if (['localhost', '127.0.0.1'].includes(new URL(configured, window.location.origin).hostname)) return configured; } catch { /* Use the local fallback. */ }
      }
      const port = (window as any).__E2E_API_PORT__ || (window.location.port === '3100' ? '4100' : '4000');
      return `${window.location.protocol}//${host}:${port}`;
    }

    // Remote browser host (Vercel, Render, custom domain):
    const configured = process.env.NEXT_PUBLIC_API_URL;
    if (configured && configured.startsWith('http') && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
      return configured;
    }
    return 'https://tfhc-orderliness-api.onrender.com';
  }
  if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes('localhost')) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return process.env.NODE_ENV === 'production' ? 'https://tfhc-orderliness-api.onrender.com' : 'http://localhost:4000';
};

export const API_BASE_URL = getApiBaseUrl();

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchApi<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ApiError('You are offline. This action needs an internet connection.', 0);
  }

  const headers: Record<string, string> = {
    ...(typeof FormData !== 'undefined' && options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    cache: 'no-store',
    headers,
  });

  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch (e) {
      // JSON parse error fallback
    }
    throw new ApiError(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage, response.status);
  }

  if (response.status === 204) return undefined as T;
  // Some endpoints (e.g. GET /meetings/active with no active meeting) legitimately
  // return 200 with an empty body — Response.json() throws on that, so read text first.
  const body = await response.text();
  if (!body) return undefined as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    return undefined as T;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<T> {
  const { body, ...rest } = options;
  return fetchApi<T>(endpoint, {
    ...rest,
    body: body !== undefined ? (typeof body === 'string' || (typeof FormData !== 'undefined' && body instanceof FormData) ? body : JSON.stringify(body)) : undefined,
  });
}

function tokenSubject(token: string | null): string | null {
  try {
    const part = token?.split('.')[1];
    return part ? JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null : null;
  } catch { return null; }
}

export function saveAuthToken(token: string, remember = true) {
  if (typeof window !== 'undefined') {
    const previousAccount = tokenSubject(getAuthToken());
    removeAuthToken(false);
    (remember ? localStorage : sessionStorage).setItem('tfhc_token', token);
    if (previousAccount !== tokenSubject(token)) window.dispatchEvent(new Event('tfhc:account-change'));
  }
}

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('tfhc_token') || sessionStorage.getItem('tfhc_token');
  }
  return null;
}

export function saveAuthUser(user: any, remember = true) {
  if (typeof window !== 'undefined') {
    try {
      const payload = JSON.stringify(user);
      if (remember) {
        localStorage.setItem('tfhc_user_profile', payload);
      } else {
        sessionStorage.setItem('tfhc_user_profile', payload);
      }
    } catch {
      // storage unavailable / quota exceeded
    }
  }
}

export function getCachedUser(): any | null {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('tfhc_user_profile') || sessionStorage.getItem('tfhc_user_profile');
      if (raw) return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function removeAuthToken(notify = true) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('tfhc_venue_session');
    localStorage.removeItem('tfhc_token');
    sessionStorage.removeItem('tfhc_token');
    localStorage.removeItem('tfhc_user_profile');
    sessionStorage.removeItem('tfhc_user_profile');
    if (notify) {
      window.dispatchEvent(new Event('tfhc:logout'));
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistration().then(async registration => {
          const subscription = await registration?.pushManager?.getSubscription();
          await subscription?.unsubscribe();
          const notifications = await registration?.getNotifications();
          notifications?.forEach(notification => notification.close());
        }).catch(() => undefined);
      }
    }
  }
}

/**
 * End the session: tell the API (best-effort — it only stamps the account
 * timeline) then drop the local token. Callers redirect to /login afterwards.
 */
export async function logout() {
  try {
    await fetchApi('/auth/logout', { method: 'POST', signal: AbortSignal.timeout(5000) });
  } catch {
    // Stateless sessions — a failed call must never block sign-out.
  }
  removeAuthToken();
}

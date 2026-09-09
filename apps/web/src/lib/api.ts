export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

  const headers: Record<string, string> = {
    ...(typeof FormData !== 'undefined' && options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
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

export function saveAuthToken(token: string, remember = true) {
  if (typeof window !== 'undefined') {
    removeAuthToken();
    (remember ? localStorage : sessionStorage).setItem('tfhc_token', token);
  }
}

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('tfhc_token') || sessionStorage.getItem('tfhc_token');
  }
  return null;
}

export function removeAuthToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('tfhc_venue_session');
    localStorage.removeItem('tfhc_token');
    sessionStorage.removeItem('tfhc_token');
  }
}

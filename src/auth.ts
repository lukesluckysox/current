// Client-side auth glue.
//
// Talks to /api/auth/{me,status,login,register,logout}. Sessions are signed
// httpOnly cookies set by the server, so we just include credentials on
// every request.
//
// The auth feature is only active when the server reports `configured: true`
// from /api/auth/status (i.e. DATABASE_URL is set). When unconfigured the
// app skips the login gate and runs as before.

export type AuthUser = { id: number; username: string };

export type AuthStatus = {
  configured: boolean;
  hasUser: boolean;
  openRegistration: boolean;
};

export type AuthError =
  | 'invalid_credentials'
  | 'username_taken'
  | 'invalid_username'
  | 'invalid_password'
  | 'registration_closed'
  | 'auth_unavailable'
  | 'network'
  | 'unknown';

const TIMEOUT_MS = 8000;

function apiBase(): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env && (process.env.EXPO_PUBLIC_API_BASE as string | undefined);
  return (fromEnv || '').replace(/\/+$/, '');
}

async function call<T>(
  pathname: string,
  init: RequestInit & { method: 'GET' | 'POST' },
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: AuthError; message?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}${pathname}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      credentials: 'include',
      signal: controller.signal,
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (body && typeof body.error === 'string' ? body.error : 'unknown') as AuthError,
        message: body && typeof body.message === 'string' ? body.message : undefined,
      };
    }
    return { ok: true, data: body as T };
  } catch (err: any) {
    return { ok: false, status: 0, error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const r = await call<AuthStatus>('/api/auth/status', { method: 'GET' });
  if (r.ok) return r.data;
  // If auth/status itself can't be reached, treat as unconfigured so the app
  // doesn't get stuck on a login screen with no server.
  return { configured: false, hasUser: false, openRegistration: false };
}

export async function fetchMe(): Promise<AuthUser | null> {
  const r = await call<{ user: AuthUser }>('/api/auth/me', { method: 'GET' });
  return r.ok ? r.data.user : null;
}

export async function login(username: string, password: string) {
  return call<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function register(username: string, password: string) {
  return call<{ user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  return call<{ ok: true }>('/api/auth/logout', { method: 'POST' });
}

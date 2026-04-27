// Client-side auth glue.
//
// Talks to /api/auth/{me,status,login,register,logout}. Sessions are signed
// httpOnly cookies set by the server, so we just include credentials on
// every request.
//
// /api/auth/status returns one of:
//   { mode: 'disabled', ... }              — dev-only escape hatch; render app
//   { mode: 'required', configured: true } — show login gate
//   { mode: 'required', configured: false, error: 'auth_unavailable' }
//                                          — DB missing/down; show error
//
// If the status request itself fails (e.g. server unreachable), we treat it
// as `auth_unavailable` so the app never silently bypasses the login gate
// against a misconfigured deploy.

export type AuthUser = { id: number; username: string };

export type AuthMode = 'disabled' | 'required';

export type AuthStatus =
  | { mode: 'disabled'; configured: false; hasUser: false; openRegistration: false }
  | { mode: 'required'; configured: true; hasUser: boolean; openRegistration: boolean }
  | { mode: 'required'; configured: false; hasUser: false; openRegistration: false; error: 'auth_unavailable' };

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
): Promise<
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; data: any; error: AuthError; message?: string }
> {
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
        data: body,
        error: (body && typeof body.error === 'string' ? body.error : 'unknown') as AuthError,
        message: body && typeof body.message === 'string' ? body.message : undefined,
      };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch (err: any) {
    return { ok: false, status: 0, data: null, error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const r = await call<AuthStatus>('/api/auth/status', { method: 'GET' });
  if (r.ok) return r.data;
  // 503 with a structured body still tells us the server's intent.
  if (r.data && typeof r.data === 'object' && r.data.mode === 'required') {
    return {
      mode: 'required',
      configured: false,
      hasUser: false,
      openRegistration: false,
      error: 'auth_unavailable',
    };
  }
  // Anything else (network failure, unexpected shape): fail closed — assume
  // auth is required and unavailable. We never silently bypass the gate.
  return {
    mode: 'required',
    configured: false,
    hasUser: false,
    openRegistration: false,
    error: 'auth_unavailable',
  };
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

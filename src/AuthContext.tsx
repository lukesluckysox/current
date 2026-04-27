import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthUser, AuthStatus, fetchAuthStatus, fetchMe, logout as apiLogout } from './auth';

type AuthState =
  | { status: 'loading' }
  | { status: 'disabled' } // dev-only escape hatch — render app
  | { status: 'unavailable' } // auth required but server can't service it (DB missing/down)
  | { status: 'unauthenticated'; canRegister: boolean }
  | { status: 'authenticated'; user: AuthUser };

type AuthContextValue = AuthState & {
  refresh: () => Promise<void>;
  signIn: (user: AuthUser) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    const status: AuthStatus = await fetchAuthStatus();
    if (status.mode === 'disabled') {
      setState({ status: 'disabled' });
      return;
    }
    // mode === 'required'
    if (!status.configured) {
      setState({ status: 'unavailable' });
      return;
    }
    const me = await fetchMe();
    if (me) {
      setState({ status: 'authenticated', user: me });
    } else {
      setState({
        status: 'unauthenticated',
        canRegister: status.openRegistration,
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback((user: AuthUser) => {
    setState({ status: 'authenticated', user });
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    await refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ ...state, refresh, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

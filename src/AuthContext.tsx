import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthUser, AuthStatus, fetchAuthStatus, fetchMe, logout as apiLogout } from './auth';

type AuthState =
  | { status: 'loading' }
  | { status: 'disabled' } // server has no DATABASE_URL — auth feature off
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
    if (!status.configured) {
      setState({ status: 'disabled' });
      return;
    }
    const me = await fetchMe();
    if (me) {
      setState({ status: 'authenticated', user: me });
    } else {
      setState({
        status: 'unauthenticated',
        canRegister: status.openRegistration || !status.hasUser,
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

import React, {
  createContext, useContext, useState, useEffect, useCallback,
} from 'react';
import { ColorScheme, setColorScheme, getColorScheme } from './theme';
import { getConfig, setConfig } from './db/database';

const CONFIG_KEY = 'color_scheme_v1';

type ThemeContextValue = {
  scheme: ColorScheme;
  toggle: () => void;
  set: (s: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setScheme] = useState<ColorScheme>(getColorScheme());

  // Restore persisted scheme on mount. We do this synchronously-ish: by the
  // time the auth gate clears (DB init has finished), getConfig is callable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getConfig(CONFIG_KEY);
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark') {
          if (stored !== getColorScheme()) {
            setColorScheme(stored);
            setScheme(stored);
          }
        }
      } catch {
        // ignore — stay on default dark
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = useCallback((s: ColorScheme) => {
    if (s === getColorScheme()) return;
    setColorScheme(s);
    setScheme(s);
    // Fire-and-forget; persistence is best-effort.
    setConfig(CONFIG_KEY, s).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    set(getColorScheme() === 'dark' ? 'light' : 'dark');
  }, [set]);

  return (
    <ThemeContext.Provider value={{ scheme, toggle, set }}>
      {children}
    </ThemeContext.Provider>
  );
}

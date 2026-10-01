import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'xui-theme';
export const PUBLIC_THEME_STORAGE_KEY = 'xui-public-theme';
export const USER_THEME_STORAGE_KEY = PUBLIC_THEME_STORAGE_KEY;
export const ADMIN_THEME_STORAGE_KEY = 'xui-admin-theme:anonymous';
export const adminThemeStorageKey = (userId: string) => `xui-admin-theme:${userId}`;

function readTheme(storageKey: string, fallbackTheme: ThemeMode): ThemeMode {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }
  if (storageKey === STORAGE_KEY && typeof document !== 'undefined') {
    const current = document.documentElement.dataset.theme;
    if (current === 'light' || current === 'dark') return current;
  }
  return fallbackTheme;
}

function applyDocumentTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: ThemeMode, storageKey: string) {
  applyDocumentTheme(theme);
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function applyStoredTheme(storageKey: string, fallbackTheme: ThemeMode = 'light') {
  applyDocumentTheme(readTheme(storageKey, fallbackTheme));
}

export const ThemeScope: React.FC<{
  storageKey: string;
  fallbackTheme?: ThemeMode;
  children: React.ReactNode;
}> = ({ storageKey, fallbackTheme = 'light', children }) => {
  useLayoutEffect(() => {
    applyStoredTheme(storageKey, fallbackTheme);
  }, [fallbackTheme, storageKey]);

  return <>{children}</>;
};

export const ThemeToggle: React.FC<{
  compact?: boolean;
  className?: string;
  storageKey?: string;
  fallbackTheme?: ThemeMode;
}> = ({ compact = false, className = '', storageKey = STORAGE_KEY, fallbackTheme = 'light' }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme(storageKey, fallbackTheme));

  useEffect(() => {
    applyTheme(theme, storageKey);
  }, [storageKey, theme]);

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      data-theme-mode={theme}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      aria-label={`切换为${theme === 'dark' ? '亮色' : '柔和夜间'}模式`}
      title={`切换为${theme === 'dark' ? '亮色' : '柔和夜间'}模式`}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <Sun className="theme-toggle-sun" />
        <Moon className="theme-toggle-moon" />
        <i />
      </span>
      {!compact && <span className="theme-toggle-label">{theme === 'dark' ? '柔和夜间' : '亮色模式'}</span>}
    </button>
  );
};

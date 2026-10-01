import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import {
  ADMIN_THEME_STORAGE_KEY,
  applyStoredTheme,
  PUBLIC_THEME_STORAGE_KEY,
  ThemeScope,
  USER_THEME_STORAGE_KEY,
} from './components/ThemeToggle.tsx';
import { api } from './commercial.ts';
import './index.css';

const bootPath = window.location.pathname.replace(/\/+$/, '') || '/';
const bootThemeStorageKey = bootPath === '/login' || bootPath === '/register' || bootPath === '/console' || bootPath.startsWith('/console/')
  ? USER_THEME_STORAGE_KEY
  : bootPath === '/admin' || bootPath.startsWith('/admin/')
    ? ADMIN_THEME_STORAGE_KEY
    : PUBLIC_THEME_STORAGE_KEY;
applyStoredTheme(bootThemeStorageKey);

const ConsoleApp = lazy(() => import('./App.tsx'));
const AdminApp = lazy(() => import('./AdminApp.tsx'));
const UserAuthApp = lazy(() => import('./UserAuthApp.tsx'));
const LandingPage = lazy(() => import('./components/LandingPage.tsx').then(module => ({ default: module.LandingPage })));

function normalizedPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function RootRouter() {
  const [adminPath, setAdminPath] = useState<string | null>(null);

  useEffect(() => {
    api<{ adminPath: string }>('/api/runtime-config')
      .then(config => setAdminPath(config.adminPath || 'admin'))
      .catch(() => setAdminPath('admin'));
  }, []);

  useEffect(() => {
    const path = normalizedPath();
    const adminRoot = `/${adminPath || 'admin'}`;

    if (path === adminRoot || path.startsWith(`${adminRoot}/`)) document.title = '运营管理后台';
    else if (path === '/console' || path.startsWith('/console/')) document.title = '用户工作台';
    else if (path === '/login') document.title = '用户登录';
    else if (path === '/register') document.title = '用户注册';
    else document.title = '网络搭建服务';
  }, [adminPath]);

  if (!adminPath) return <div className="app-route-loading" aria-label="正在加载" />;

  const path = normalizedPath();
  const adminRoot = `/${adminPath}`;

  if (path === adminRoot || path.startsWith(`${adminRoot}/`)) return <AdminApp />;
  if (path === '/console' || path.startsWith('/console/')) return <ThemeScope storageKey={USER_THEME_STORAGE_KEY}><ConsoleApp /></ThemeScope>;
  if (path === '/login') return <ThemeScope storageKey={USER_THEME_STORAGE_KEY}><UserAuthApp mode="login" /></ThemeScope>;
  if (path === '/register') return <ThemeScope storageKey={USER_THEME_STORAGE_KEY}><UserAuthApp mode="register" /></ThemeScope>;
  return <ThemeScope storageKey={PUBLIC_THEME_STORAGE_KEY}><LandingPage adminPath={adminPath} /></ThemeScope>;
}

const rootElement = document.getElementById('root') as HTMLElement & { __xuiReactRoot?: Root };
const root = rootElement.__xuiReactRoot ?? createRoot(rootElement);
rootElement.__xuiReactRoot = root;

root.render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div className="app-route-loading" role="status" aria-label="正在加载页面" />}>
        <RootRouter />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);


import { StrictMode, useEffect, useState } from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AdminApp from './AdminApp.tsx';
import UserAuthApp from './UserAuthApp.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { api } from './commercial.ts';
import './index.css';
import './admin.css';
import './admin-console.css';
import './admin-redesign.css';

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
  if (path === '/console' || path.startsWith('/console/')) return <App />;
  if (path === '/login') return <UserAuthApp mode="login" />;
  if (path === '/register') return <UserAuthApp mode="register" />;
  return <LandingPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RootRouter />
    </ErrorBoundary>
  </StrictMode>,
);

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AdminApp from './AdminApp.tsx';
import UserAuthApp from './UserAuthApp.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

const path = window.location.pathname.replace(/\/+$/, '') || '/';

const RootApp = path === '/admin' || path.startsWith('/admin/')
  ? AdminApp
  : path === '/console' || path.startsWith('/console/')
    ? App
    : path === '/login'
      ? () => <UserAuthApp mode="login" />
      : path === '/register'
        ? () => <UserAuthApp mode="register" />
        : LandingPage;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RootApp />
    </ErrorBoundary>
  </StrictMode>,
);

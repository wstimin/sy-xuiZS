import React, { useEffect, useState } from 'react';
import { api, CurrentUser } from './commercial';
import { AdminAuthView } from './components/AdminAuthView';
import { AdminView } from './components/AdminView';
import { Toast } from './components/Toast';
import { ToastMessage } from './types';

export default function AdminApp() {
  const [loading, setLoading] = useState(true);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    Promise.all([
      api<{ user: CurrentUser | null }>('/api/admin/auth/me'),
      api<{ required: boolean }>('/api/auth/bootstrap-status'),
    ]).then(([me, bootstrap]) => {
      setUser(me.user);
      setBootstrapRequired(bootstrap.required);
    }).finally(() => setLoading(false));
  }, []);

  const showToast = (title: string, message?: string, type: ToastMessage['type'] = 'info') => {
    const id = `admin-toast-${Date.now()}-${Math.random()}`;
    setToasts(current => [...current, { id, title, message, type }]);
    setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 4000);
  };

  const logout = async () => {
    await api('/api/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  };

  if (loading) return <div className="admin-loading"><span /><p>正在连接管理服务...</p></div>;
  if (!user) return <AdminAuthView bootstrapRequired={bootstrapRequired} onAuthenticated={authenticated => { setUser(authenticated); setBootstrapRequired(false); }} />;

  return <div className="admin-app-shell">
    <AdminView currentUser={user} showToast={showToast} onLogout={() => void logout()} onSessionEnded={() => setUser(null)} onCurrentUserChanged={setUser} />
    <Toast toasts={toasts} onDismiss={id => setToasts(current => current.filter(item => item.id !== id))} />
  </div>;
}

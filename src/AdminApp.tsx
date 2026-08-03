import React, { useEffect, useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { api, CurrentUser } from './commercial';
import { AuthView } from './components/AuthView';
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

  if (loading) return <div className="min-h-screen bg-[#0a0a0c] text-zinc-400 flex items-center justify-center">正在加载管理端...</div>;
  if (!user) return <AuthView portal="admin" bootstrapRequired={bootstrapRequired} onAuthenticated={authenticated => { setUser(authenticated); setBootstrapRequired(false); }} />;

  return <div className="min-h-screen bg-[#0a0a0c] text-slate-200">
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0c]/95 backdrop-blur">
      <div className="max-w-7xl mx-auto min-h-16 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><ShieldCheck className="w-6 h-6 text-indigo-400" /><div><div className="font-semibold text-white">xui 商业管理端</div><div className="text-xs text-zinc-500">{user.username}</div></div></div>
        <div className="flex items-center gap-2"><a href="/" className="h-9 px-3 border border-white/10 rounded-md text-sm flex items-center hover:bg-white/5">打开用户端</a><button onClick={() => void logout()} title="退出管理端" className="w-9 h-9 border border-white/10 rounded-md flex items-center justify-center hover:text-rose-300"><LogOut className="w-4 h-4" /></button></div>
      </div>
    </header>
    <AdminView showToast={showToast} onSessionEnded={() => setUser(null)} />
    <Toast toasts={toasts} onDismiss={id => setToasts(current => current.filter(item => item.id !== id))} />
  </div>;
}

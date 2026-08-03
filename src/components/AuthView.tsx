import React, { useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { api, CurrentUser } from '../commercial';

interface AuthViewProps {
  bootstrapRequired: boolean;
  onAuthenticated: (user: CurrentUser) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ bootstrapRequired, onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>(bootstrapRequired ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const endpoint = bootstrapRequired ? '/api/auth/bootstrap' : mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const result = await api<{ user: CurrentUser }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md border border-white/10 bg-zinc-950 p-6 sm:p-8 rounded-lg shadow-2xl">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-11 h-11 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">xui 搭建助手</h1>
            <p className="text-xs text-zinc-500">账号、权益与搭建任务统一管理</p>
          </div>
        </div>

        {bootstrapRequired ? (
          <div className="mb-5 p-3 rounded-md border border-amber-500/25 bg-amber-500/10 text-sm text-amber-200">
            首次运行，请创建管理员账号。该账号可配置套餐并确认用户订单。
          </div>
        ) : (
          <div className="grid grid-cols-2 bg-white/5 p-1 rounded-md mb-6">
            <button type="button" onClick={() => setMode('login')} className={`py-2 text-sm rounded ${mode === 'login' ? 'bg-indigo-600 text-white' : 'text-zinc-400'}`}>登录</button>
            <button type="button" onClick={() => setMode('register')} className={`py-2 text-sm rounded ${mode === 'register' ? 'bg-indigo-600 text-white' : 'text-zinc-400'}`}>注册</button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="block text-xs text-zinc-400 mb-1.5">用户名</span>
            <div className="relative">
              <UserPlus className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
              <input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" className="w-full bg-black/40 border border-white/10 rounded-md py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-500" placeholder="3-64 位用户名" />
            </div>
          </label>
          <label className="block">
            <span className="block text-xs text-zinc-400 mb-1.5">密码</span>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="w-full bg-black/40 border border-white/10 rounded-md py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-500" placeholder="至少 8 位" />
            </div>
          </label>
          {error && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3 rounded-md">{error}</div>}
          <button disabled={busy} className="w-full h-11 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2">
            <LogIn className="w-4 h-4" />
            {busy ? '正在提交...' : bootstrapRequired ? '创建管理员并进入' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </div>
    </div>
  );
};

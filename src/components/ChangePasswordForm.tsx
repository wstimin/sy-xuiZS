import React, { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { api } from '../commercial';

interface ChangePasswordFormProps {
  endpoint: string;
  onChanged: () => void;
  showToast?: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ endpoint, onChanged, showToast }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (nextPassword !== confirmPassword) return setError('两次输入的新密码不一致');
    setBusy(true);
    setError('');
    try {
      await api(endpoint, { method: 'POST', body: JSON.stringify({ currentPassword, nextPassword }) });
      showToast?.('密码已修改', '请使用新密码重新登录', 'success');
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '密码修改失败');
    } finally {
      setBusy(false);
    }
  };

  return <form onSubmit={submit} className="max-w-xl border border-white/10 rounded-lg p-5 space-y-4">
    <div><h2 className="font-semibold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-indigo-400" />修改密码</h2><p className="text-xs text-zinc-500 mt-1">修改后当前登录会话会退出。</p></div>
    <label className="block text-xs text-zinc-400">当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1 w-full h-10 rounded-md bg-black/35 border border-white/10 px-3 text-sm outline-none focus:border-indigo-500" /></label>
    <label className="block text-xs text-zinc-400">新密码<input type="password" autoComplete="new-password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} className="mt-1 w-full h-10 rounded-md bg-black/35 border border-white/10 px-3 text-sm outline-none focus:border-indigo-500" /></label>
    <label className="block text-xs text-zinc-400">确认新密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-1 w-full h-10 rounded-md bg-black/35 border border-white/10 px-3 text-sm outline-none focus:border-indigo-500" /></label>
    {error && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3 rounded-md">{error}</div>}
    <button disabled={busy} className="h-10 px-4 bg-indigo-600 rounded-md text-sm flex items-center gap-2 disabled:opacity-60"><Save className="w-4 h-4" />{busy ? '正在保存...' : '修改密码'}</button>
  </form>;
};

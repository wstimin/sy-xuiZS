import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api, CurrentUser } from '../commercial';

interface AdminAuthViewProps {
  bootstrapRequired: boolean;
  onAuthenticated: (user: CurrentUser) => void;
}

export const AdminAuthView: React.FC<AdminAuthViewProps> = ({ bootstrapRequired, onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: CurrentUser }>(
        bootstrapRequired ? '/api/auth/bootstrap' : '/api/admin/auth/login',
        { method: 'POST', body: JSON.stringify({ username, password }) },
      );
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-grid" aria-hidden="true" />
      <header className="admin-auth-topbar">
        <a href="/" className="admin-auth-brand">
          <span><ShieldCheck /></span>
          <div><strong>NEXUS CONTROL</strong><small>OPERATIONS CONSOLE</small></div>
        </a>
        <a href="/" className="admin-auth-back"><ArrowLeft /> 返回首页</a>
      </header>

      <main className="admin-auth-layout">
        <section className="admin-auth-intro">
          <span className="admin-auth-kicker">SECURE OPERATIONS ACCESS</span>
          <h1>业务运营与交付管理中心</h1>
          <p>统一处理用户、订单、服务权益和交付任务。所有数据均来自当前业务数据库，关键操作会记录并立即影响用户可用权益。</p>
          <div className="admin-auth-capabilities">
            <div><ShieldCheck /><span><strong>独立管理会话</strong><small>管理端与用户端登录状态相互隔离</small></span></div>
            <div><LockKeyhole /><span><strong>受控业务操作</strong><small>收款、退款、调额和任务核对均需明确确认</small></span></div>
          </div>
        </section>

        <section className="admin-auth-panel" aria-labelledby="admin-auth-title">
          <div className="admin-auth-panel-head">
            <span><LockKeyhole /></span>
            <div>
              <small>{bootstrapRequired ? 'INITIAL SETUP' : 'ADMIN SIGN IN'}</small>
              <h2 id="admin-auth-title">{bootstrapRequired ? '初始化管理员' : '管理员登录'}</h2>
            </div>
          </div>
          {bootstrapRequired && (
            <div className="admin-auth-notice">
              当前系统尚未创建账号。此处提交的账号将成为首个管理员，请妥善保管密码。
            </div>
          )}
          <form onSubmit={submit} className="admin-auth-form">
            <label>
              <span>管理员账号</span>
              <div className="admin-auth-input"><UserRound /><input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" minLength={3} maxLength={64} required placeholder="请输入管理员账号" /></div>
            </label>
            <label>
              <span>密码</span>
              <div className="admin-auth-input">
                <KeyRound />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={bootstrapRequired ? 'new-password' : 'current-password'} minLength={bootstrapRequired ? 8 : 1} required placeholder={bootstrapRequired ? '请输入至少 8 位密码' : '请输入管理员密码'} />
                <button type="button" onClick={() => setShowPassword(value => !value)} title={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff /> : <Eye />}</button>
              </div>
            </label>
            {error && <div className="admin-auth-error" role="alert">{error}</div>}
            <button className="admin-auth-submit" disabled={busy}>
              {busy ? '正在验证...' : bootstrapRequired ? '创建管理员并进入后台' : '进入管理后台'}
              {!busy && <ArrowRight />}
            </button>
          </form>
          <footer><ShieldCheck /> 仅授权运营人员可访问</footer>
        </section>
      </main>
    </div>
  );
};

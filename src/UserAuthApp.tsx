import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Network,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api, CurrentUser } from './commercial';

interface UserAuthAppProps {
  mode: 'login' | 'register';
}

export default function UserAuthApp({ mode }: UserAuthAppProps) {
  const isLogin = mode === 'login';
  const [checking, setChecking] = useState(true);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<{ user: CurrentUser | null }>('/api/auth/me'),
      api<{ required: boolean }>('/api/auth/bootstrap-status'),
    ]).then(([me, bootstrap]) => {
      if (me.user) {
        window.location.replace('/console');
        return;
      }
      setBootstrapRequired(bootstrap.required);
    }).catch(() => undefined).finally(() => setChecking(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isLogin && bootstrapRequired) return;
    setBusy(true);
    setError('');
    try {
      await api<{ user: CurrentUser }>(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      window.location.assign('/console');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return <div className="auth-loading"><span className="auth-loading-mark"><Network className="h-6 w-6" /></span><p>正在连接账户服务...</p></div>;
  }

  return (
    <div className="user-auth-shell">
      <div className="auth-network-scene" aria-hidden="true">
        <div className="auth-grid" />
        <span className="auth-line auth-line-one" />
        <span className="auth-line auth-line-two" />
        <span className="auth-line auth-line-three" />
        <span className="auth-point auth-point-one" />
        <span className="auth-point auth-point-two" />
        <span className="auth-point auth-point-three" />
      </div>

      <header className="auth-topbar">
        <a href="/" className="brand-lockup">
          <span className="brand-mark"><Network className="h-5 w-5" /></span>
          <span><strong>NEXUS CLOUD</strong><small>GLOBAL NETWORK DELIVERY</small></span>
        </a>
        <a href="/" className="auth-back"><ArrowLeft className="h-4 w-4" /> 返回首页</a>
      </header>

      <main className="auth-layout">
        <section className="auth-story">
          <span className="auth-eyebrow">SECURE ACCESS / NEXUS ID</span>
          <h1>{isLogin ? '欢迎回来，继续连接全球业务' : '创建你的全球网络工作台'}</h1>
          <p>
            {isLogin
              ? '登录后查看服务权益、发起环境交付任务，并统一管理每一次执行记录。'
              : '一个账户管理服务权益、交付任务和使用记录，让跨境业务与 AI 应用更快进入运行状态。'}
          </p>
          <div className="auth-benefits">
            <span><CheckCircle2 className="h-5 w-5" /> 服务权益清晰可见</span>
            <span><CheckCircle2 className="h-5 w-5" /> 任务执行进度可追踪</span>
            <span><CheckCircle2 className="h-5 w-5" /> 多种业务环境统一管理</span>
          </div>
        </section>

        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-panel-head">
            <span className="auth-panel-icon">{isLogin ? <LockKeyhole className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}</span>
            <div>
              <span>{isLogin ? 'ACCOUNT LOGIN' : 'CREATE ACCOUNT'}</span>
              <h2 id="auth-title">{isLogin ? '登录账户' : '注册账户'}</h2>
            </div>
          </div>

          {bootstrapRequired && !isLogin && (
            <div className="auth-notice">
              <ShieldCheck className="h-5 w-5" />
              <div><strong>注册服务暂未开放</strong><p>系统正在进行首次初始化，请稍后再试。</p></div>
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            <label>
              <span>用户名</span>
              <div className="auth-input-wrap">
                <UserRound className="h-5 w-5" />
                <input
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  autoComplete="username"
                  minLength={3}
                  maxLength={64}
                  required
                  placeholder="输入 3-64 位用户名"
                />
              </div>
            </label>

            <label>
              <span>密码</span>
              <div className="auth-input-wrap">
                <KeyRound className="h-5 w-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                  placeholder="输入至少 8 位密码"
                />
                <button type="button" onClick={() => setShowPassword(value => !value)} title={showPassword ? '隐藏密码' : '显示密码'}>
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button className="auth-submit" disabled={busy || (!isLogin && bootstrapRequired)}>
              {busy ? '正在处理...' : isLogin ? '登录并进入工作台' : '创建账户并进入'}
              {!busy && <ArrowRight className="h-5 w-5" />}
            </button>
          </form>

          <div className="auth-switch">
            {isLogin ? '还没有账户？' : '已经拥有账户？'}
            <a href={isLogin ? '/register' : '/login'}>{isLogin ? '立即注册' : '返回登录'}</a>
          </div>
          <div className="auth-security"><ShieldCheck className="h-4 w-4" /> 账户会话与管理端相互独立</div>
        </section>
      </main>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { PanelDeployForm, PanelResult, SystemType, ScriptType } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import {
  Terminal, Key, Server, Lock, Globe, Shield, Sparkles, Copy, Check, ExternalLink, Play, ArrowRight, X, Code2, CheckCircle2,
  AlertTriangle, ShieldAlert, Cpu, HardDrive, Activity, Clock, AlertCircle, ChevronDown, ChevronUp, Zap
} from 'lucide-react';

interface PanelDeployViewProps {
  onPanelCreated: (result: PanelResult) => void;
  onGoToNodeWithPanel: (result: PanelResult) => void;
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface SshTestDetails {
  targetHost: string;
  sshPort: number;
  sshUser: string;
  latencyMs: number;
  osName: string;
  arch: string;
  kernel: string;
  glibcVersion: string;
  systemdVersion: string;
  systemdAvailable: boolean;
  totalRamMb: number;
  freeRamMb: number;
  diskFreeMb: number;
  cpuCores: number;
  packageManager: string;
  isRoot: boolean;
  hasCurl: boolean;
  warnings: string[];
  status: 'compatible' | 'warning' | 'incompatible';
}

const DEPLOY_STEPS_INFO = [
  { step: 1, title: 'SSH 握手与凭据校验', desc: '建立 SSH 会话并记录远程主机密钥指纹' },
  { step: 2, title: '服务器环境检测', desc: '读取系统、架构、内存、systemd 与权限信息' },
  { step: 3, title: '生成安装参数', desc: '生成端口、Web 路径、管理员凭据与 SSL 模式' },
  { step: 4, title: '执行安装脚本', desc: '通过 SSH 执行所选安装脚本并安全收集输出' },
  { step: 5, title: '安装程序处理中', desc: '由官方安装器安装程序并写入面板配置' },
  { step: 6, title: '面板配置初始化', desc: '初始化管理员、数据库及 API 访问设置' },
  { step: 7, title: '服务状态验证', desc: '检查 x-ui systemd 服务并读取安装结果' },
  { step: 8, title: '读取访问参数', desc: '从仅 root 可读的结果文件提取访问信息' },
  { step: 9, title: '部署完成', desc: '确认服务已启动并返回一次性登录凭据' }
];

export const PanelDeployView: React.FC<PanelDeployViewProps> = ({
  onPanelCreated,
  onGoToNodeWithPanel,
  showToast
}) => {
  const [form, setForm] = useState<PanelDeployForm>({
    ipOrDomain: '',
    sshPort: 22,
    sshUser: 'root',
    authType: 'password',
    sshPassword: '',
    sshPrivateKey: '',
    panelPort: '',
    panelPath: '',
    panelUsername: '',
    panelPassword: '',
    domain: '',
    systemType: 'debian-ubuntu',
    autoSSL: true,
    scriptType: 'recommended',
    customScriptUrl: ''
  });

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployStep, setDeployStep] = useState<number>(0);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<PanelResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // New state for SSH testing & System inspection
  const [isTestingSSH, setIsTestingSSH] = useState(false);
  const [sshTestResult, setSshTestResult] = useState<SshTestDetails | null>(null);

  // New state for warnings card toggle & progress timer
  const [showWarningsCard, setShowWarningsCard] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer for installation progress
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isDeploying) {
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(timer);
  }, [isDeploying]);

  // Automatically enable SSL checkbox when domain is filled
  useEffect(() => {
    if (form.domain && form.domain.trim().length > 0) {
      if (!form.autoSSL) {
        setForm(prev => ({ ...prev, autoSSL: true }));
      }
    }
  }, [form.domain]);

  const handleCopy = async (text: string, fieldName: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedField(fieldName);
      showToast('已复制到剪贴板', text, 'success');
      setTimeout(() => setCopiedField(null), 2000);
    } else {
      showToast('复制失败', '请手动选中文本进行复制', 'error');
    }
  };

  const handleRandomizePorts = () => {
    const randomPort = Math.floor(Math.random() * 40000) + 15000;
    const randomHex = Math.random().toString(36).substring(2, 7);
    setForm(prev => ({
      ...prev,
      panelPort: String(randomPort),
      panelPath: `/xui_${randomHex}`
    }));
    showToast('已随机生成端口与路径', `端口: ${randomPort}, 路径: /xui_${randomHex}`, 'info');
  };

  const [sshTestError, setSshTestError] = useState<string | null>(null);

  const cleanHostStr = (val: string) => {
    if (!val) return '';
    return val.trim().replace(/^(https?:\/\/)/i, '').replace(/\/.*$/, '').replace(/:[0-9]+$/, '').trim();
  };

  const updateSshConnection = (changes: Partial<PanelDeployForm>) => {
    setForm(prev => ({ ...prev, ...changes, sshSessionId: '' }));
  };

  const handleCopyOneKeyCmd = () => {
    const cmd = "bash <(curl -Ls https://raw.githubusercontent.com/wstimin/mogai-3xui/main/install.sh)";
    handleCopy(cmd, 'onekeycmd');
  };

  // SSH Connection & System Inspection Handler
  const handleTestSSH = async () => {
    const cleanIp = cleanHostStr(form.ipOrDomain);
    if (!cleanIp) {
      showToast('请输入服务器 IP 或域名', '例如 192.0.2.1 或 vps.example.com', 'warning');
      return;
    }

    if (cleanIp !== form.ipOrDomain) {
      setForm(prev => ({ ...prev, ipOrDomain: cleanIp }));
    }

    if (form.authType === 'password' && !form.sshPassword) {
      showToast('请输入 SSH 密码', '测试 SSH 连接需要填入认证密码', 'warning');
      return;
    }

    if (form.authType === 'privateKey' && !form.sshPrivateKey) {
      showToast('请输入 SSH 私钥', '测试 SSH 连接需要填入私钥内容', 'warning');
      return;
    }

    setIsTestingSSH(true);
    setSshTestResult(null);
    setSshTestError(null);
    setForm(prev => ({ ...prev, sshSessionId: '' }));

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 40_000);
    try {
      const res = await fetch('/api/test-ssh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ipOrDomain: cleanIp }),
        signal: controller.signal
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `SSH 检测接口返回 HTTP ${res.status}`);
      }

      setSshTestResult(data.details);
      setForm(prev => ({ ...prev, sshSessionId: data.sshSessionId || '' }));
      showToast('SSH 连接及系统环境检测成功！', `网络延迟 ${data.details.latencyMs}ms | ${data.details.osName}`, 'success');
    } catch (err: any) {
      const errMsg = err?.name === 'AbortError'
        ? 'SSH 检测超过 40 秒，请检查服务器安全组、防火墙和 SSH 端口'
        : err.message || '请检查 IP、端口、密码或云服务商安全组';
      setSshTestError(errMsg);
      showToast('SSH 连接测试失败', errMsg, 'error');
    } finally {
      window.clearTimeout(timeout);
      setIsTestingSSH(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanIp = cleanHostStr(form.ipOrDomain);
    if (!cleanIp) {
      showToast('请输入服务器 IP 或域名', '这是 SSH 连接的必需字段', 'warning');
      return;
    }

    if (cleanIp !== form.ipOrDomain) {
      setForm(prev => ({ ...prev, ipOrDomain: cleanIp }));
    }

    if (form.authType === 'password' && !form.sshPassword) {
      showToast('请输入 SSH 密码', '或切换为 SSH 私钥认证方式', 'warning');
      return;
    }

    if (form.authType === 'privateKey' && !form.sshPrivateKey) {
      showToast('请输入 SSH 私钥内容', '请粘贴完整的 id_rsa 或 pem 私钥', 'warning');
      return;
    }

    if (form.scriptType === 'custom') {
      try {
        const customUrl = new URL(form.customScriptUrl || '');
        if (customUrl.protocol !== 'https:') throw new Error();
      } catch {
        showToast('自定义脚本地址无效', '自定义安装脚本必须是完整的 HTTPS URL', 'warning');
        return;
      }
    }

    const customPanelUsername = form.panelUsername?.trim() || '';
    const customPanelPassword = form.panelPassword?.trim() || '';
    if (customPanelUsername && !/^[A-Za-z0-9_.@-]{3,64}$/.test(customPanelUsername)) {
      showToast('面板用户名格式不正确', '请输入 3-64 位字母、数字、点、下划线、@ 或短横线', 'warning');
      return;
    }
    if (customPanelPassword && (customPanelPassword.length < 8 || customPanelPassword.length > 128)) {
      showToast('面板密码长度不正确', '自定义密码必须为 8-128 位；留空则自动生成安全密码', 'warning');
      return;
    }

    setIsDeploying(true);
    setDeployLogs([]);
    setDeployStep(1);
    setDeployError(null);
    setSshTestError(null);

    try {
      const res = await fetch('/api/deploy-panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ipOrDomain: cleanIp })
      });

      if (!res.ok) {
        let errText = '后端接口响应异常';
        try {
          const errJson = await res.json();
          if (errJson?.error) errText = errJson.error;
        } catch {
          // ignore
        }
        throw new Error(errText);
      }

      if (!res.body) throw new Error('浏览器未收到部署日志流');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let backendResult: PanelResult | null = null;
      let streamError = '';

      const consumeLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          throw new Error('后端返回了无法解析的部署日志');
        }
        if (event.type === 'log') {
          setDeployLogs(prev => [...prev, String(event.message || '')]);
          if (Number.isFinite(Number(event.step))) {
            setDeployStep(Math.max(1, Math.min(9, Number(event.step))));
          }
        } else if (event.type === 'result' && event.result) {
          backendResult = event.result as PanelResult;
        } else if (event.type === 'error') {
          streamError = String(event.error || '远程部署失败');
          setDeployLogs(prev => [...prev, `[ERROR] ${streamError}`]);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(consumeLine);
        if (done) break;
      }
      if (buffer.trim()) consumeLine(buffer);
      if (streamError) throw new Error(streamError);
      if (!backendResult) throw new Error('部署流已结束，但没有收到完整安装结果');

      setDeployStep(9);
      onPanelCreated(backendResult);
      setResultModal(backendResult);
      showToast('搭建成功！', '3x-ui 已安装并通过服务状态验证', 'success');
    } catch (err: any) {
      const message = err?.message || '请检查后端通信与网络连接';
      setDeployError(message);
      showToast('面板部署异常', message, 'error');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Page Title & Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-indigo-400 mb-1">
            <Terminal className="w-4 h-4" /> XUI Panel Automatic Installer
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">搭建 xui面板</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            填写服务器 SSH 及面板路径规则，自动化部署 xui面板 管理面板。
          </p>
        </div>

        <button
          type="button"
          onClick={handleRandomizePorts}
          className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-zinc-200 border border-white/10 flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          随机端口/路径
        </button>
      </div>

      {/* System Recommendations & Known Warnings Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 text-xs space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span>系统环境建议与已知兼容性警告</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-normal">
              使用前必读
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowWarningsCard(!showWarningsCard)}
            className="text-amber-400/80 hover:text-amber-300 text-[11px] flex items-center gap-1 font-medium transition-colors"
          >
            {showWarningsCard ? '收起指南' : '展开指南'}
            {showWarningsCard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showWarningsCard && (
          <div className="grid sm:grid-cols-2 gap-3 pt-2 text-zinc-300 leading-relaxed border-t border-amber-500/10 animate-in fade-in duration-200">
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
              <div className="font-semibold text-emerald-400 flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>推荐操作系统 (Recommended OS)</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                强烈推荐使用 <strong className="text-zinc-200">Debian 12 (Bookworm) / 13</strong> 或 <strong className="text-zinc-200">Ubuntu 22.04 / 24.04 LTS</strong> (64位)。最新稳定版系统预装完整 GLIBC、OpenSSL 3.0 及 systemd 依赖组件。
              </p>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
              <div className="font-semibold text-rose-400 flex items-center gap-1.5 text-xs">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>低版本系统 / 缺失组件风险警告</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                <strong className="text-rose-300">Debian 10/11、Ubuntu 18.04/20.04、CentOS 7/8</strong> 容易缺少最新的 systemd 守护模块、socat 或 OpenSSL3 动态库，可能导致 Xray-core、acme.sh 或 Python 环境安装失败。
              </p>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
              <div className="font-semibold text-indigo-300 flex items-center gap-1.5 text-xs">
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>云服务商安全组 (Security Group)</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                阿里云/腾讯云/华为云/AWS/GCP 用户，必须在控制台【安全组】开放所选面板端口，以及 <strong className="text-zinc-200">80/443</strong> 端口（申请 SSL 证书时需要）。
              </p>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5 text-xs">
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                <span>内存与 Swap 交换区配置</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                内存小于 512MB 的超小 VPS，建议提前配置 1GB Swap 虚拟内存交换区，防止运行或拉取二进制文件时触发 OOM (内存溢出) 导致服务中断。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main Deployment Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Server Connection Details & SSH Test Button */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              服务器 SSH 连接信息
            </h2>

            <button
              type="button"
              onClick={handleTestSSH}
              disabled={isTestingSSH || isDeploying}
              className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
            >
              {isTestingSSH ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                  <span>正在快速检测...</span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span>快速检测 SSH 与必要环境</span>
                </>
              )}
            </button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>服务器 IP 或域名 <span className="text-rose-400">*</span></span>
              </label>
              <input
                type="text"
                required
                placeholder="例如 192.0.2.1 或 vps.example.com"
                value={form.ipOrDomain}
                onChange={e => updateSshConnection({ ipOrDomain: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                SSH 端口
              </label>
              <input
                type="number"
                value={form.sshPort}
                onChange={e => updateSshConnection({ sshPort: parseInt(e.target.value, 10) || 22 })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                SSH 用户名
              </label>
              <input
                type="text"
                value={form.sshUser}
                onChange={e => updateSshConnection({ sshUser: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>认证方式</span>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="authType"
                      checked={form.authType === 'password'}
                      onChange={() => updateSshConnection({ authType: 'password' })}
                      className="accent-indigo-500"
                    />
                    <span className={form.authType === 'password' ? 'text-indigo-300 font-medium' : 'text-zinc-400'}>SSH 密码</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="authType"
                      checked={form.authType === 'privateKey'}
                      onChange={() => updateSshConnection({ authType: 'privateKey' })}
                      className="accent-indigo-500"
                    />
                    <span className={form.authType === 'privateKey' ? 'text-indigo-300 font-medium' : 'text-zinc-400'}>SSH 私钥</span>
                  </label>
                </div>
              </label>

              {form.authType === 'password' ? (
                <div className="relative">
                  <input
                    type="password"
                    placeholder="输入 root 密码"
                    value={form.sshPassword || ''}
                    onChange={e => updateSshConnection({ sshPassword: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all pr-10"
                  />
                  <Key className="w-4 h-4 text-zinc-500 absolute right-3 top-2.5" />
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                    value={form.sshPrivateKey || ''}
                    onChange={e => updateSshConnection({ sshPrivateKey: e.target.value })}
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-xs font-mono placeholder-zinc-500 outline-none transition-all resize-none"
                  />
                  <input
                    type="password"
                    placeholder="私钥口令（未加密私钥可留空）"
                    value={form.sshPrivateKeyPassphrase || ''}
                    onChange={e => updateSshConnection({ sshPrivateKeyPassphrase: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
                  />
                </div>
              )}
            </div>
          </div>

          {/* SSH & System Inspection Diagnostic Card */}
          {sshTestResult && (
            <div className="mt-4 p-4 rounded-xl bg-black/40 border border-indigo-500/30 space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5 text-xs">
                <div className={`flex items-center gap-2 font-semibold ${sshTestResult.status === 'incompatible' ? 'text-rose-400' : sshTestResult.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {sshTestResult.status === 'incompatible' ? <ShieldAlert className="w-4 h-4" /> : sshTestResult.status === 'warning' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{sshTestResult.status === 'incompatible' ? 'SSH 已连接，但服务器环境不兼容' : sshTestResult.status === 'warning' ? 'SSH 已连接，服务器环境存在警告' : 'SSH 通信与系统环境检测正常'}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-400" /> RTT: {sshTestResult.latencyMs} ms
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    端口 {sshTestResult.sshPort} 可达
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="system-status-card system-status-card--cyan space-y-0.5">
                  <span className="text-zinc-500 font-mono block">操作系统 OS</span>
                  <span className="system-status-card__value" title={sshTestResult.osName}>{sshTestResult.osName}</span>
                </div>

                <div className="system-status-card system-status-card--indigo space-y-0.5">
                  <span className="text-zinc-500 font-mono block">系统架构</span>
                  <span className="system-status-card__value">{sshTestResult.arch}</span>
                </div>

                <div className="system-status-card system-status-card--emerald space-y-0.5">
                  <span className="text-zinc-500 font-mono block">内存总量</span>
                  <span className="system-status-card__value">{sshTestResult.totalRamMb} MB</span>
                </div>

                <div className="system-status-card system-status-card--amber space-y-0.5">
                  <span className="text-zinc-500 font-mono block">systemd</span>
                  <span className="system-status-card__value">{sshTestResult.systemdAvailable ? '可用' : '不可用'}</span>
                </div>
                <div className="system-status-card system-status-card--sky">
                  <span className="text-zinc-500 font-mono block">磁盘可用</span>
                  <span className="system-status-card__value">{sshTestResult.diskFreeMb ? `${Math.round(sshTestResult.diskFreeMb / 1024)} GB` : '未获取'}</span>
                </div>
                <div className="system-status-card system-status-card--lime">
                  <span className="text-zinc-500 font-mono block">安装依赖</span>
                  <span className="system-status-card__value">{sshTestResult.packageManager} / curl {sshTestResult.hasCurl ? '可用' : '缺失'}</span>
                </div>
              </div>

              {sshTestResult.warnings && sshTestResult.warnings.length > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 space-y-1">
                  {sshTestResult.warnings.map((w, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SSH & System Inspection Error Diagnostic Card */}
          {sshTestError && (
            <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 font-semibold text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>SSH 握手与凭据校验未通过</span>
              </div>

              <div className="text-[11px] text-zinc-300 font-mono bg-black/40 p-2.5 rounded-lg border border-white/5">
                错误说明: <span className="text-rose-300">{sshTestError}</span>
              </div>

              <div className="space-y-1.5 text-[11px] text-zinc-400">
                <p className="font-semibold text-zinc-200">💡 常见原因与推荐解决方法:</p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li><strong className="text-zinc-300">云控制台防火墙未放行</strong>: 请登录阿里云/腾讯云/AWS/甲骨文云控制台【安全组】放行 TCP: 22 端口。</li>
                  <li><strong className="text-zinc-300">输入格式包含额外字符</strong>: 系统现已支持自动切除 <code className="text-amber-300">http://</code> 前缀，请确保 IP/域名不含空格。</li>
                  <li><strong className="text-zinc-300">禁用密码登录</strong>: 若您的 VPS 禁用了密码登录，请将认证方式切至【SSH 私钥】模式。</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-indigo-300 text-xs flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    备用极速方案: 直接在 VPS 命令行粘贴一键命令
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyOneKeyCmd}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 text-[11px] font-medium flex items-center gap-1 border border-indigo-500/30 transition-colors"
                  >
                    {copiedField === 'onekeycmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'onekeycmd' ? '已复制命令' : '复制命令'}</span>
                  </button>
                </div>
                <code className="block p-2 rounded-lg bg-black/60 text-emerald-400 font-mono text-[11px] break-all border border-white/5 select-all">
                  bash &lt;(curl -Ls https://raw.githubusercontent.com/wstimin/mogai-3xui/main/install.sh)
                </code>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Panel & SSL Settings */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-4">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 border-b border-white/10 pb-3">
            <Lock className="w-4 h-4 text-emerald-400" />
            xui 面板端口与 URL 访问配置
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>面板端口 (可选)</span>
                <span className="text-[10px] text-zinc-500">不填将随机生成安全端口</span>
              </label>
              <input
                type="text"
                placeholder="例: 2053 或 54321"
                value={form.panelPort || ''}
                onChange={e => setForm({ ...form, panelPort: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>路径后缀 Path (可选)</span>
                <span className="text-[10px] text-zinc-500">不填将自动生成例如 /xui</span>
              </label>
              <input
                type="text"
                placeholder="例如: /xui 或 /admin_9a2f"
                value={form.panelPath || ''}
                onChange={e => setForm({ ...form, panelPath: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <Key className="w-4 h-4 text-amber-400" />
                面板管理员账号
              </div>
              <span className="text-[10px] text-zinc-500">可选，留空将自动生成安全凭据</span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">登录用户名</label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="例如: admin_xui"
                  value={form.panelUsername || ''}
                  onChange={e => setForm({ ...form, panelUsername: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">登录密码</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位；留空自动生成"
                  value={form.panelPassword || ''}
                  onChange={e => setForm({ ...form, panelPassword: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
                />
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              安装完成后，助手会调用 3x-ui 官方 <code className="text-indigo-300">x-ui setting</code> 命令写入该账号密码并重启服务；推荐脚本和官方脚本都会真实生效。
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                绑定域名 (可选)
              </label>
              <input
                type="text"
                placeholder="例: xui.yourdomain.com"
                value={form.domain || ''}
                onChange={e => setForm({ ...form, domain: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>操作系统环境</span>
                <span className="text-[10px] text-indigo-400 font-mono">脚本支持自动检测</span>
              </label>
              <select
                value={form.systemType}
                onChange={e => setForm({ ...form, systemType: e.target.value as SystemType })}
                className="w-full px-3.5 py-2 rounded-xl bg-[#121218] border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all cursor-pointer"
              >
                <option value="debian-ubuntu">Debian 12+ / Ubuntu 22.04+ (首选推荐)</option>
                <option value="centos">CentOS Stream 9+ / AlmaLinux 9+ / Rocky 9+</option>
                <option value="autodetect">自动检测系统 (Auto-detect)</option>
              </select>
            </div>
          </div>

          {/* SSL Checkbox Logic Notice */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoSSL}
                onChange={e => setForm({ ...form, autoSSL: e.target.checked })}
                disabled={form.scriptType === 'recommended'}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="font-medium text-zinc-200">
                自动开启 SSL 证书 (acme.sh / IP 证书 / 自签名)
              </span>
            </label>
            {form.autoSSL ? (
              form.domain ? (
                <span className="text-[11px] text-indigo-400 font-mono">已提供域名：申请域名 SSL 证书</span>
              ) : (
                <span className="text-[11px] text-emerald-400 font-mono">无域名模式：使用 IP 证书 / 自签名 SSL</span>
              )
            ) : (
              <span className="text-[11px] text-zinc-400">未开启 SSL (使用 HTTP 协议)</span>
            )}
            {form.scriptType === 'recommended' && (
              <span className="text-[11px] text-zinc-500">推荐脚本要求配置 TLS，因此该选项保持开启。</span>
            )}
          </div>
        </div>

        {/* Section 3: Script Selection */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-400" />
              安装脚本选择
            </h2>
            <span className="text-[11px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {form.scriptType === 'official' ? '已选择官方脚本' : form.scriptType === 'custom' ? '已选择自定义脚本' : '已设为推荐脚本'}
            </span>
          </div>

          <div className="space-y-3">
            <select
              value={form.scriptType || 'recommended'}
              onChange={e => {
                const scriptType = e.target.value as ScriptType;
                setForm({ ...form, scriptType, autoSSL: scriptType === 'recommended' ? true : form.autoSSL });
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-black/50 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all cursor-pointer"
            >
              <option value="recommended" className="bg-zinc-900 text-white">
                推荐脚本（默认，兼容客户端更多）
              </option>
              <option value="official" className="bg-zinc-900 text-white">
                官方脚本
              </option>
              <option value="custom" className="bg-zinc-900 text-white">
                自定义脚本
              </option>
            </select>

            {form.scriptType === 'recommended' && (
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                推荐脚本优先适配更多客户端。该脚本安装时要求配置 TLS：有域名使用域名证书，无域名使用 IP 证书。
              </p>
            )}

            {form.scriptType === 'custom' && (
              <div className="pt-1 animate-in fade-in duration-200">
                <input
                  type="url"
                  placeholder="请输入自定义脚本 URL (例: https://example.com/install.sh)"
                  value={form.customScriptUrl || ''}
                  onChange={e => setForm({ ...form, customScriptUrl: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 focus:border-indigo-500 text-white text-xs placeholder-zinc-500 outline-none transition-all font-mono"
                />
              </div>
            )}
          </div>
        </div>

        {/* Submit Action Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isDeploying}
            className={`w-full py-3.5 px-6 rounded-2xl font-bold text-base text-white bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20 transition-all duration-300 flex items-center justify-center gap-2 ${
              isDeploying ? 'opacity-80 cursor-not-allowed' : 'hover:scale-[1.005]'
            }`}
          >
            {isDeploying ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在自动化部署 xui面板 ({deployStep}/9)...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>一键搭建 xui面板</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Deploying Visual Progress & Interactive Timeline */}
      {(isDeploying || deployLogs.length > 0 || deployError) && (
        <div className="p-6 rounded-2xl bg-[#0a0a0c] border border-white/10 space-y-6 shadow-2xl animate-in fade-in duration-300">
          {/* Header & Percentage Progress Bar */}
          <div className="space-y-3 border-b border-white/10 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className={`w-5 h-5 ${deployError ? 'text-rose-400' : 'text-indigo-400 animate-spin'}`} />
                <h3 className="text-base font-bold text-white">
                  {deployError ? '3x-ui 自动化安装失败' : isDeploying ? '3x-ui 自动化安装进行中' : '3x-ui 自动化安装状态'}
                </h3>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  已耗时: <strong className="text-zinc-200">{String(elapsedTime).padStart(2, '0')}s</strong>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                  {Math.min(Math.round((deployStep / 9) * 100), 100)}%
                </span>
              </div>
            </div>

            {/* Visual Animated Progress Bar */}
            <div className="w-full bg-white/5 rounded-full h-3 p-0.5 overflow-hidden border border-white/10">
              <div
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out shadow-sm shadow-indigo-500/50 relative"
                style={{ width: `${Math.min(Math.round((deployStep / 9) * 100), 100)}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
              </div>
            </div>
          </div>

          {deployError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
              {deployError}
            </div>
          )}

          {/* 9-Step Visual Interactive Timeline */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {DEPLOY_STEPS_INFO.map(s => {
              const isCompleted = deployStep > s.step;
              const isActive = deployStep === s.step;
              return (
                <div
                  key={s.step}
                  className={`p-3 rounded-xl border transition-all duration-300 flex items-start gap-2.5 ${
                    isCompleted
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : isActive
                      ? 'bg-indigo-500/15 border-indigo-500/50 text-white shadow-md shadow-indigo-500/10 scale-[1.01]'
                      : 'bg-white/5 border-white/5 text-zinc-500 opacity-60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isActive ? (
                      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-zinc-600 flex items-center justify-center text-[9px] font-mono">
                        {s.step}
                      </div>
                    )}
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1 text-xs font-semibold">
                      <span className="truncate">{s.title}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 line-clamp-1">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Deployment status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                部署状态
              </span>
              <span className="text-[11px] text-zinc-500">
                已生成 {deployLogs.length} 条记录
              </span>
            </div>

            <div className="space-y-1.5 max-h-40 overflow-y-auto p-3 bg-black/60 rounded-xl border border-white/10 font-mono text-[11px] text-zinc-300">
              {deployLogs.map((log, idx) => {
                const safeLog = typeof log === 'string' ? log : String(log || '');
                const isSuccess = safeLog.includes('SUCCESS');
                const isSsl = safeLog.includes('SSL');
                return (
                  <p key={idx} className="leading-relaxed flex items-start gap-2">
                    <span className="text-zinc-600 shrink-0">[{new Date().toLocaleTimeString()}]</span>
                    <span className={isSuccess ? 'text-emerald-400 font-semibold' : isSsl ? 'text-indigo-300' : 'text-zinc-300'}>
                      {safeLog}
                    </span>
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Result Modal Popup */}
      {resultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-[#0d0d12] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">xui面板 搭建成功！</h3>
                  <p className="text-xs text-zinc-400">请妥善保存下方完整登录访问信息</p>
                </div>
              </div>
              <button
                onClick={() => setResultModal(null)}
                className="p-1 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Login Details Card */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-zinc-400">面板访问地址 (Access URL)</label>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10 text-indigo-300 font-mono text-xs sm:text-sm break-all">
                  <span>{resultModal.accessUrl}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => handleCopy(resultModal.accessUrl, 'accessUrl')}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                      title="复制链接"
                    >
                      {copiedField === 'accessUrl' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a
                      href={resultModal.accessUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-indigo-400 transition-colors"
                      title="在新标签页打开"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-zinc-400">初始用户名 (User)</label>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10 text-zinc-200 font-mono text-xs">
                    <span>{resultModal.username}</span>
                    <button
                      onClick={() => handleCopy(resultModal.username, 'username')}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                    >
                      {copiedField === 'username' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-zinc-400">初始密码 (Password)</label>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10 text-zinc-200 font-mono text-xs">
                    <span>{resultModal.password || '未返回'}</span>
                    <button
                      onClick={() => handleCopy(resultModal.password || '', 'password')}
                      disabled={!resultModal.password}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                    >
                      {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] font-mono text-zinc-400">API Token 访问令牌</label>
                  <span className={resultModal.apiToken ? 'text-[10px] text-emerald-400' : 'text-[10px] text-amber-400'}>
                    {resultModal.apiToken ? '跳转搭建节点时自动填写' : '缺少 Token，无法创建节点'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/10 text-zinc-200 font-mono text-xs">
                  <span className="break-all leading-relaxed">{resultModal.apiToken || '未获取到 Token'}</span>
                  <button
                    onClick={() => handleCopy(resultModal.apiToken || '', 'apiToken')}
                    disabled={!resultModal.apiToken}
                    className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    title="复制 API Token"
                  >
                    {copiedField === 'apiToken' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-zinc-400">监听端口 (Port)</label>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-zinc-200 font-mono text-xs">
                    {resultModal.port}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-zinc-400">路径后缀 (Path)</label>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-zinc-200 font-mono text-xs">
                    {resultModal.path}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={() => {
                  onGoToNodeWithPanel(resultModal);
                  setResultModal(null);
                }}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition-all"
              >
                <span>预填面板参数并跳转「搭建节点」</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setResultModal(null)}
                className="w-full sm:w-auto py-3 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 font-medium text-sm transition-colors"
              >
                关闭弹窗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

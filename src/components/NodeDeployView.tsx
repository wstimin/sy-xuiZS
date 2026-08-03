import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { NodeDeployForm, NodeResult, ProtocolType, TransportType, SecurityType, PanelFlavor } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import { ensureAssistantConnection } from '../utils/apiConnection';
import { parseSocksInput } from '../utils/socksParser';
import {
  checkTransportAllowed,
  checkSecurityAllowed,
  getRecommendedDefaults
} from '../utils/protocolMatrix';
import {
  Network,
  Lock,
  Layers,
  Copy,
  Check,
  QrCode,
  Sliders,
  Sparkles,
  Info,
  X,
  Code2,
  Share2,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Clock,
  Square
} from 'lucide-react';

const NODE_DEPLOY_STEPS = [
  '安全参数',
  '创建入站',
  '配置路由',
  '生成结果',
  '完成'
];

interface NodeDeployViewProps {
  initialPanelData?: {
    host: string;
    port: string;
    path: string;
    protocol?: 'http' | 'https';
    username: string;
    password?: string;
    apiToken?: string;
    panelFlavor?: PanelFlavor;
    webCertFile?: string;
    webKeyFile?: string;
  } | null;
  onNodeCreated: (result: NodeResult) => void;
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const NodeDeployView: React.FC<NodeDeployViewProps> = ({
  initialPanelData,
  onNodeCreated,
  showToast
}) => {
  const [form, setForm] = useState<NodeDeployForm>({
    panelAddress: initialPanelData?.host || '',
    panelPort: initialPanelData?.port || '',
    panelPath: initialPanelData?.path || '',
    panelProtocol: initialPanelData?.protocol || 'http',
    allowInsecureTls: false,
    panelUser: initialPanelData?.username || '',
    panelPass: initialPanelData?.password || '',
    panelToken: initialPanelData?.apiToken || '',
    panelFlavor: initialPanelData?.panelFlavor || 'compatible',
    tlsCertFile: initialPanelData?.webCertFile || '',
    tlsKeyFile: initialPanelData?.webKeyFile || '',

    nodeName: '',
    protocol: 'VLESS',
    transport: 'TCP',
    security: 'Reality',
    inboundPort: '',
    sni: '',
    shortId: '',

    trafficLimitGb: 0,
    expireDays: 0,

    socksRawInput: '',
    autoOutbound: true,
    autoRouting: true,
    enableLoadBalance: false
  });

  const [isDeploying, setIsDeploying] = useState(false);
  const [isFetchingTls, setIsFetchingTls] = useState(false);
  const [tlsStatus, setTlsStatus] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<NodeResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deployStep, setDeployStep] = useState(0);
  const [deployMessage, setDeployMessage] = useState('');
  const [deployError, setDeployError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const deployControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isDeploying) return;
    const timer = window.setInterval(() => setElapsedTime(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isDeploying]);

  useEffect(() => () => deployControllerRef.current?.abort(), []);

  const cleanHostStr = (val: string) => {
    if (!val) return '';
    return val.trim().replace(/^(https?:\/\/)+/i, '').replace(/\/.*$/, '').replace(/:[0-9]+$/, '').trim();
  };

  const handleFetchTls = async () => {
    const cleanAddress = cleanHostStr(form.panelAddress);
    if (!cleanAddress) {
      showToast('请输入 3x-ui 面板地址', '需要先连接目标面板才能读取 TLS 证书配置', 'warning');
      return;
    }
    if (!form.panelUser.trim() || !form.panelPass.trim()) {
      showToast('TLS 需要面板账号密码', '证书配置接口只支持登录 Session，不能只使用 API Token', 'warning');
      return;
    }
    setIsFetchingTls(true);
    setTlsStatus(null);
    try {
      await ensureAssistantConnection();
      const res = await fetch('/api/get-panel-tls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, panelAddress: cleanAddress })
      });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || !data.success || !data.files) throw new Error(data.error || '无法读取面板 TLS 配置');
      setForm(prev => ({
        ...prev,
        sni: prev.sni?.trim() || cleanAddress,
        tlsCertFile: data.files.webCertFile,
        tlsKeyFile: data.files.webKeyFile
      }));
      setTlsStatus(`已获取面板证书：${data.files.webCertFile}`);
      showToast('TLS 证书配置获取成功', '创建节点时将自动使用目标面板的 Web 证书', 'success');
    } catch (err: any) {
      const message = err?.message || '请先在 3x-ui 面板中申请或安装证书';
      setTlsStatus(message);
      showToast('TLS 证书获取失败', message, 'error');
    } finally {
      setIsFetchingTls(false);
    }
  };

  // Sync initial panel prefill
  useEffect(() => {
    if (initialPanelData) {
      setForm(prev => ({
        ...prev,
        panelAddress: initialPanelData.host,
        panelPort: initialPanelData.port,
        panelPath: initialPanelData.path,
        panelProtocol: initialPanelData.protocol || 'http',
        allowInsecureTls: false,
        panelUser: initialPanelData.username,
        panelPass: initialPanelData.password || '',
        panelToken: initialPanelData.apiToken || '',
        panelFlavor: initialPanelData.panelFlavor || 'compatible',
        tlsCertFile: initialPanelData.webCertFile || '',
        tlsKeyFile: initialPanelData.webKeyFile || ''
      }));
    }
  }, [initialPanelData]);

  // Handle Protocol change and auto-adjust incompatible transport/security
  const handleProtocolChange = (newProtocol: ProtocolType) => {
    const defaults = getRecommendedDefaults(newProtocol);
    setForm(prev => {
      let nextTrans = prev.transport;
      let nextSec = prev.security;

      // Validate if current transport is valid for new protocol
      if (!checkTransportAllowed(newProtocol, nextTrans).allowed) {
        nextTrans = defaults.transport;
      }

      // Validate if current security is valid for new protocol & transport
      if (!checkSecurityAllowed(newProtocol, nextTrans, nextSec).allowed) {
        nextSec = defaults.security;
      }

      return {
        ...prev,
        protocol: newProtocol,
        transport: nextTrans,
        security: nextSec,
        inboundPort: '',
        pathOrServiceName: nextTrans === 'WebSocket' || nextTrans === 'gRPC' ? prev.pathOrServiceName : ''
      };
    });
  };

  // Handle Transport change and check security conflict
  const handleTransportChange = (newTransport: TransportType) => {
    setForm(prev => {
      let nextSec = prev.security;
      const secCheck = checkSecurityAllowed(prev.protocol, newTransport, nextSec);
      if (!secCheck.allowed) {
        // Auto pick valid default security
        if (newTransport === 'mKCP') {
          nextSec = 'None';
        } else if (prev.protocol === 'VLESS' && newTransport === 'TCP') {
          nextSec = 'Reality';
        } else if (prev.protocol === 'Trojan') {
          nextSec = 'TLS';
        } else {
          nextSec = 'TLS';
        }
      }

      return {
        ...prev,
        transport: newTransport,
        security: nextSec,
        pathOrServiceName: newTransport === 'WebSocket' || newTransport === 'gRPC' ? prev.pathOrServiceName : ''
      };
    });
  };

  // Render QR Code on canvas whenever resultModal is set
  useEffect(() => {
    if (resultModal && qrCanvasRef.current) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        resultModal.shareLink,
        {
          width: 220,
          margin: 1.5,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        },
        err => {
          if (err) console.error('QR code generation error:', err);
        }
      );
    }
  }, [resultModal]);

  const handleCopy = async (text: string, fieldName: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedField(fieldName);
      showToast('已复制到剪贴板', '内容已成功复制', 'success');
      setTimeout(() => setCopiedField(null), 2000);
    } else {
      showToast('复制失败', '请手动选中文本进行复制', 'error');
    }
  };

  const parsedSocksList = parseSocksInput(form.socksRawInput);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanAddress = cleanHostStr(form.panelAddress);
    if (!cleanAddress) {
      showToast('请输入 3-xui 面板地址', '例: 192.0.2.1 或 xui.example.com', 'warning');
      return;
    }

    if (cleanAddress !== form.panelAddress) {
      setForm(prev => ({ ...prev, panelAddress: cleanAddress }));
    }

    if (!form.panelToken?.trim()) {
      showToast('缺少 API Token', '请从面板搭建结果进入节点页面，或手动填写 3x-ui API Token', 'warning');
      return;
    }

    // Double check conflict rules before submission
    const secCheck = checkSecurityAllowed(form.protocol, form.transport, form.security);
    if (!secCheck.allowed) {
      showToast('配置存在协议冲突', secCheck.reason || '请修正协议组合', 'error');
      return;
    }
    if (form.security === 'TLS' && (!form.tlsCertFile?.trim() || !form.tlsKeyFile?.trim())) {
      showToast('缺少 TLS 证书路径', '请从刚搭建完成的面板进入，或先读取一次面板证书', 'warning');
      return;
    }
    if (form.autoOutbound && parsedSocksList.length > 0 && (!form.panelUser.trim() || !form.panelPass.trim())) {
      showToast('SOCKS 路由需要面板账号密码', 'Xray 全局配置接口只支持登录 Session，不能只使用 API Token', 'warning');
      return;
    }

    const controller = new AbortController();
    deployControllerRef.current = controller;
    setIsDeploying(true);
    setDeployStep(1);
    setDeployMessage(form.security === 'Reality' ? '正在向面板获取 Reality 密钥' : '正在生成安全参数');
    setDeployError(null);
    setElapsedTime(0);

    try {
      await ensureAssistantConnection(controller.signal);
      const res = await fetch('/api/deploy-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          panelAddress: cleanAddress,
          sni: form.security === 'Reality' ? '' : form.sni,
          shortId: form.security === 'Reality' ? '' : form.shortId
        }),
        signal: controller.signal
      });
      if (!res.ok || !res.body) throw new Error(`节点创建请求失败，HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result: NodeResult | null = null;
      let streamError = '';

      const readNextChunk = async () => {
        let inactivityTimer = 0;
        try {
          return await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              inactivityTimer = window.setTimeout(() => {
                reject(new Error('长时间没有收到后端进度，已停止等待。面板可能仍在处理，请先检查入站列表后再重试'));
                controller.abort();
              }, 45_000);
            })
          ]);
        } finally {
          window.clearTimeout(inactivityTimer);
        }
      };

      const consumeLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === 'progress') {
          setDeployStep(Math.max(1, Math.min(NODE_DEPLOY_STEPS.length, Number(event.step) || 1)));
          setDeployMessage(String(event.message || '正在创建节点'));
        } else if (event.type === 'result' && event.result) {
          result = event.result as NodeResult;
        } else if (event.type === 'error') {
          streamError = String(event.error || '节点创建失败');
        }
      };

      while (true) {
        const { value, done } = await readNextChunk();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(consumeLine);
        if (done) break;
      }
      if (buffer.trim()) consumeLine(buffer);
      if (streamError) throw new Error(streamError);
      if (!result) throw new Error('节点创建流已结束，但没有收到完整结果');

      setDeployStep(NODE_DEPLOY_STEPS.length);
      setDeployMessage('节点创建完成');
      setForm(prev => ({ ...prev, inboundPort: '' }));
      onNodeCreated(result);
      setResultModal(result);
      showToast('节点创建成功', '已通过 3x-ui API 快速创建入站', 'success');
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setDeployMessage('已终止创建，后端正在回滚本次变更');
        setDeployError('创建操作已由你终止');
        showToast('已终止节点创建', '已通知后端取消请求并回滚本次创建的入站与路由', 'info');
      } else {
        const message = err?.message || '请检查面板地址、路径和认证信息';
        setDeployError(message);
        showToast('节点创建失败', message, 'error');
      }
    } finally {
      if (deployControllerRef.current === controller) deployControllerRef.current = null;
      setIsDeploying(false);
    }
  };

  const handleCancelDeploy = () => {
    if (!deployControllerRef.current) return;
    setDeployMessage('正在终止请求并回滚已写入的配置...');
    deployControllerRef.current.abort();
  };

  const protocolsList: ProtocolType[] = ['VLESS', 'VMess', 'Trojan', 'Shadowsocks'];
  const transportsList: TransportType[] = ['TCP', 'WebSocket', 'gRPC', 'mKCP'];
  const securitiesList: SecurityType[] = ['None', 'TLS', 'Reality'];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Page Title */}
      <div className="pb-6 border-b border-white/10">
        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
          <Network className="w-4 h-4" /> XUI Panel Inbound & Chain Proxy Configurator
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">搭建节点 (支持 SOCKS 链式)</h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          智能选择协议、传输与伪装通道，支持绑定多 SOCKS 出站实现前置隐蔽中继。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Panel Login Credentials */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" />
              ui面板 连接参数 (Panel Login)
            </h2>
            {initialPanelData && (
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 已自动预填刚部署的面板信息
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">访问协议</label>
              {initialPanelData ? (
                <input
                  type="text"
                  readOnly
                  value={form.panelProtocol.toUpperCase()}
                  title="已使用面板安装结果中的实际访问协议"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#121218] border border-white/10 text-white text-sm outline-none cursor-default"
                />
              ) : (
                <select
                  value={form.panelProtocol}
                  onChange={e => setForm({ ...form, panelProtocol: e.target.value as 'http' | 'https', allowInsecureTls: false })}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#121218] border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                </select>
              )}
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                面板 IP 或域名 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="例如 192.0.2.1 或 xui.example.com"
                value={form.panelAddress}
                onChange={e => setForm({ ...form, panelAddress: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">面板端口</label>
              <input
                type="text"
                placeholder="例: 2053"
                value={form.panelPort}
                onChange={e => setForm({ ...form, panelPort: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
              />
            </div>
          </div>

          {!initialPanelData && form.panelProtocol === 'https' && (
            <label className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowInsecureTls}
                onChange={e => setForm({ ...form, allowInsecureTls: e.target.checked })}
                className="w-4 h-4 mt-0.5 accent-amber-500"
              />
              <span className="text-zinc-300">
                允许面板使用自签名或不受信任的 TLS 证书。仅在你确认目标服务器身份时开启。
              </span>
            </label>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">路径 Path</label>
              <input
                type="text"
                placeholder="例: /xui"
                value={form.panelPath}
                onChange={e => setForm({ ...form, panelPath: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">用户名</label>
              <input
                type="text"
                placeholder="例: admin"
                value={form.panelUser}
                onChange={e => setForm({ ...form, panelUser: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">密码</label>
              <input
                type="password"
                placeholder="面板登录密码"
                value={form.panelPass}
                onChange={e => setForm({ ...form, panelPass: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
              />
            </div>

          </div>

          {/* Token Field */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>API Token 访问令牌</span>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                搭建面板后自动带入
              </span>
            </label>

            <input
              type="password"
              required
              placeholder="请填写面板 API Token"
              value={form.panelToken || ''}
              onChange={e => setForm({ ...form, panelToken: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-indigo-200 text-xs font-mono outline-none transition-all"
            />

          </div>
        </div>

        {/* Section 2: Protocol Matrix with Interactive Conflict Resolution */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              协议组合选择 (支持智能冲突检测与变灰)
            </h2>
            <span className="text-[11px] text-zinc-400">不兼容组合将自动置灰禁用</span>
          </div>

          {/* 1. Protocol Selection Buttons */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">主传输协议 (Protocol)</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {protocolsList.map(p => (
                <button
                  type="button"
                  key={p}
                  onClick={() => handleProtocolChange(p)}
                  className={`p-3 rounded-xl border text-sm font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                    form.protocol === p
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20'
                      : 'bg-white/5 border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <span>{p}</span>
                  <span className="text-[10px] font-normal opacity-70">
                    {p === 'VLESS' && '推荐搭配 Reality'}
                    {p === 'VMess' && '通用 WS+TLS'}
                    {p === 'Trojan' && '标准 TLS 隐蔽'}
                    {p === 'Shadowsocks' && '经典 AEAD'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Transport Selection Buttons with Conflict Check */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">传输类型 (Transport)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {transportsList.map(t => {
                const transRule = checkTransportAllowed(form.protocol, t);
                const isSelected = form.transport === t;

                return (
                  <button
                    type="button"
                    key={t}
                    disabled={!transRule.allowed}
                    onClick={() => handleTransportChange(t)}
                    title={transRule.reason || `${form.protocol} + ${t}`}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition-all relative ${
                      !transRule.allowed
                        ? 'bg-white/5 border-white/5 text-zinc-600 cursor-not-allowed opacity-40 line-through'
                        : isSelected
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-500/10'
                        : 'bg-white/5 border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Security Selection Buttons with Conflict Check */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">安全 / 加密类型 (Security)</label>
            <div className="grid grid-cols-3 gap-3">
              {securitiesList.map(s => {
                const secRule = checkSecurityAllowed(form.protocol, form.transport, s);
                const isSelected = form.security === s;

                return (
                  <button
                    type="button"
                    key={s}
                    disabled={!secRule.allowed}
                    onClick={() => setForm({ ...form, security: s })}
                    title={secRule.reason || `${form.protocol} + ${form.transport} + ${s}`}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all relative flex flex-col items-center justify-center gap-1 ${
                      !secRule.allowed
                        ? 'bg-white/5 border-white/5 text-zinc-600 cursor-not-allowed opacity-40'
                        : isSelected
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-500/10'
                        : 'bg-white/5 border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <span>{s}</span>
                    {!secRule.allowed && (
                      <span className="text-[9px] text-rose-400/80 font-normal">冲突禁用</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Current Selection Rule Tip */}
            {(() => {
              const rule = checkSecurityAllowed(form.protocol, form.transport, form.security);
              return (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2 text-xs">
                  {rule.allowed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-zinc-300">
                        架构推荐：当前【<strong className="text-indigo-300">{form.protocol}</strong> + <strong className="text-indigo-300">{form.transport}</strong> + <strong className="text-emerald-300">{form.security}</strong>】为兼容性极佳的搭建模式。
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-amber-300">{rule.reason}</span>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Conditional Reality Parameters Input */}
          {form.security === 'Reality' && (
            <div className="p-4 rounded-xl bg-white/5 border border-indigo-500/30 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-300 border-b border-indigo-500/20 pb-2">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" /> Reality 自动伪装参数
                </span>
                <span className="text-[10px] text-zinc-400">零证书伪装</span>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-zinc-300 leading-relaxed bg-black/30 p-3 rounded-lg border border-white/5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-300">无需填写域名或 Short ID</p>
                  <p className="text-[11px] text-zinc-400 mt-1">创建时按目标 3x-ui 源码中的 Reality 自动规则选择可用伪装目标，同时由面板官方 API 生成密钥对；实际 SNI 会写入节点链接。</p>
                </div>
              </div>
            </div>
          )}

          {form.security === 'TLS' && (
            <div className="p-4 rounded-xl bg-white/5 border border-emerald-500/30 space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-emerald-300">复用面板 TLS 证书</div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {form.tlsCertFile && form.tlsKeyFile
                      ? '已使用面板安装阶段读取的证书路径，创建节点时不会再次请求。'
                      : '当前没有缓存证书路径；手动录入旧面板时可读取一次。'}
                  </p>
                </div>
                {(!form.tlsCertFile || !form.tlsKeyFile) && (
                  <button
                    type="button"
                    onClick={handleFetchTls}
                    disabled={isFetchingTls}
                    className="shrink-0 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium disabled:opacity-50"
                  >
                    {isFetchingTls ? '正在读取...' : '读取一次证书'}
                  </button>
                )}
              </div>
              {form.tlsCertFile && form.tlsKeyFile && (
                <p className="text-[11px] text-emerald-300 break-all p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">已复用面板证书：{form.tlsCertFile}</p>
              )}
              {tlsStatus && <p className="text-[11px] text-zinc-300 break-all p-2.5 rounded-lg bg-black/30 border border-white/5">{tlsStatus}</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                  <span>TLS 域名 / SNI</span>
                  <span className="text-[10px] text-zinc-500">可选</span>
                </label>
                <input
                  type="text"
                  placeholder="留空使用面板域名；通过 IP 登录时建议填写证书域名"
                  value={form.sni || ''}
                  onChange={e => setForm({ ...form, sni: cleanHostStr(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
                />
                <p className="text-[11px] text-zinc-500">这里只填写证书对应的域名；证书和私钥路径直接复用面板搭建结果。</p>
              </div>
            </div>
          )}

          {(form.transport === 'WebSocket' || form.transport === 'gRPC') && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                {form.transport === 'WebSocket' ? 'WebSocket 路径' : 'gRPC Service Name'}
              </label>
              <input
                type="text"
                placeholder={form.transport === 'WebSocket' ? '/xui-node' : 'xui-node'}
                value={form.pathOrServiceName || ''}
                onChange={e => setForm({ ...form, pathOrServiceName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
              />
            </div>
          )}

          {/* Node Name, Specified Port & Limits */}
          <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-white/10">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">节点备注名称</label>
              <input
                type="text"
                placeholder="例如: US-Node-01 (留空使用默认名称)"
                value={form.nodeName}
                onChange={e => setForm({ ...form, nodeName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>节点监听端口 (Inbound)</span>
                <span className="text-[10px] text-emerald-400 font-mono">自定义端口</span>
              </label>
              <input
                type="number"
                min="1"
                max="65535"
                placeholder="留空随机 (例: 443, 8443, 2082)"
                value={form.inboundPort || ''}
                onChange={e => setForm({ ...form, inboundPort: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm placeholder-zinc-500 outline-none transition-all font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">流量限制 (GB)</label>
              <input
                type="number"
                placeholder="例如 100，不填或0为无限制"
                value={form.trafficLimitGb || ''}
                onChange={e => setForm({ ...form, trafficLimitGb: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-sm outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Section 3: SOCKS Chain Proxy Area (SOCKS 链式代理 - Important) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-400" />
              SOCKS 链式代理配置
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-normal">
                可选填
              </span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
              {parsedSocksList.length > 0 ? `已识别 ${parsedSocksList.length} 个 SOCKS 代理` : '直连模式 (未填 SOCKS)'}
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
              <span>批量输入 SOCKS5 代理 <span className="text-zinc-500 font-normal">(可选，留空则节点直接出站)</span></span>
              <span className="text-[10px] text-zinc-500">格式: socks5://user:pass@ip:port 或 ip:port:user:pass</span>
            </label>
            <textarea
              rows={4}
              placeholder="每行一个 SOCKS5 代理，例:&#10;socks5://relay_user:secret123@45.76.12.89:1080&#10;45.76.12.90:1080:relay_user:secret123&#10;127.0.0.1:1080"
              value={form.socksRawInput}
              onChange={e => setForm({ ...form, socksRawInput: e.target.value })}
              className="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 text-white text-xs font-mono placeholder-zinc-500 outline-none transition-all resize-none leading-relaxed"
            />
          </div>

          {/* SOCKS Automation Toggles */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-3">
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoOutbound}
                  onChange={e => setForm({ ...form, autoOutbound: e.target.checked })}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span className="text-zinc-200 font-medium">自动添加为出站 (Outbound)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoRouting}
                  onChange={e => setForm({ ...form, autoRouting: e.target.checked })}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span className="text-zinc-200 font-medium">自动写路由规则 (Routing)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enableLoadBalance}
                  onChange={e => setForm({ ...form, enableLoadBalance: e.target.checked })}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span className="text-zinc-200 font-medium">启用负载均衡 (多 SOCKS 时)</span>
              </label>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed pt-2 border-t border-white/10">
              <Info className="w-3.5 h-3.5 text-indigo-400 inline mr-1" />
              填写 SOCKS 后，系统会在创建节点时自动配置出站 (Outbound) 和路由规则 (Routing Rules)，将该节点接入流量通过中继 SOCKS 转发，实现隐藏落地 IP 及双重加密出站。
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isDeploying}
            className={`flex-1 min-w-0 py-3.5 px-4 sm:px-6 rounded-2xl font-bold text-sm sm:text-base text-white bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20 transition-all duration-300 flex items-center justify-center gap-2 ${
              isDeploying ? 'opacity-80 cursor-not-allowed' : 'hover:scale-[1.005]'
            }`}
          >
            {isDeploying ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                <span className="truncate">{deployMessage || '正在创建节点...'}</span>
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5 shrink-0" />
                <span>一键生成节点与 SOCKS 链式路由</span>
              </>
            )}
          </button>
          {isDeploying && (
            <button
              type="button"
              onClick={handleCancelDeploy}
              className="shrink-0 px-4 sm:px-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Square className="w-4 h-4 fill-current" />
              <span className="hidden sm:inline">终止创建</span>
            </button>
          )}
        </div>
      </form>

      {(isDeploying || deployStep > 0 || deployError) && (
        <div className="p-5 sm:p-6 rounded-2xl bg-[#0a0a0c] border border-white/10 space-y-5 shadow-2xl animate-in fade-in duration-300">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Activity className={`w-5 h-5 shrink-0 ${deployError ? 'text-rose-400' : deployStep === NODE_DEPLOY_STEPS.length && !isDeploying ? 'text-emerald-400' : 'text-indigo-400 animate-pulse'}`} />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white">{deployError ? '节点创建未完成' : deployStep === NODE_DEPLOY_STEPS.length && !isDeploying ? '节点创建完成' : '节点创建进行中'}</h3>
                  <p className="text-[11px] text-zinc-400 truncate">{deployMessage}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {elapsedTime}s
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                  {Math.round((deployStep / NODE_DEPLOY_STEPS.length) * 100)}%
                </span>
              </div>
            </div>

            <div className="w-full bg-white/5 rounded-full h-3 p-0.5 overflow-hidden border border-white/10">
              <div
                className="node-deploy-progress h-full rounded-full transition-[width] duration-500 ease-out relative overflow-hidden"
                style={{ width: `${Math.max(4, Math.round((deployStep / NODE_DEPLOY_STEPS.length) * 100))}%` }}
              >
                {isDeploying && <div className="absolute inset-0 node-deploy-progress-shimmer" />}
              </div>
            </div>
          </div>

          {deployError && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">{deployError}</div>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {NODE_DEPLOY_STEPS.map((label, index) => {
              const step = index + 1;
              const completed = deployStep > step || (deployStep === NODE_DEPLOY_STEPS.length && !deployError);
              const active = deployStep === step && isDeploying;
              return (
                <div key={label} className={`h-16 p-2.5 rounded-lg border flex items-center gap-2 transition-colors ${completed ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200' : active ? 'bg-indigo-500/15 border-indigo-500/40 text-white' : 'bg-white/5 border-white/5 text-zinc-500'}`}>
                  {completed ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : active ? <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" /> : <span className="w-4 h-4 rounded-full border border-zinc-600 text-[9px] flex items-center justify-center shrink-0">{step}</span>}
                  <span className="text-[11px] font-semibold leading-tight">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Output Modal Popup with 100% Real Canvas QR Code */}
      {resultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#0d0d12] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">节点生成成功！</h3>
                  <p className="text-xs text-zinc-400">
                    已生成专属节点分享链接、可扫描二维码及 SOCKS 链式 Xray 路由规则
                  </p>
                </div>
              </div>
              <button
                onClick={() => setResultModal(null)}
                className="p-1 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* QR Code & Main Link Section */}
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="shrink-0 p-3 bg-white rounded-2xl shadow-xl border border-white/10 flex flex-col items-center">
                <canvas ref={qrCanvasRef} />
                <span className="text-[10px] font-mono text-zinc-500 mt-1">客户端真实扫码导入</span>
              </div>

              <div className="flex-1 w-full space-y-3">
                <div>
                  <label className="text-[11px] font-mono text-zinc-400">节点分享链接 (Share Link)</label>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10 text-indigo-300 font-mono text-xs break-all mt-1">
                    <span className="line-clamp-2">{resultModal.shareLink}</span>
                    <button
                      onClick={() => handleCopy(resultModal.shareLink, 'shareLink')}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white shrink-0 ml-2"
                      title="复制节点链接"
                    >
                      {copiedField === 'shareLink' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {resultModal.subscriptionUrl && <div>
                  <label className="text-[11px] font-mono text-zinc-400">专属订阅地址 (Subscription URL)</label>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10 text-emerald-300 font-mono text-xs break-all mt-1">
                    <span className="truncate">{resultModal.subscriptionUrl}</span>
                    <button
                      onClick={() => handleCopy(resultModal.subscriptionUrl || '', 'subUrl')}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white shrink-0 ml-2"
                      title="复制订阅地址"
                    >
                      {copiedField === 'subUrl' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>}
              </div>
            </div>

            {/* SOCKS Chain Proxy Status */}
            {resultModal.socksConfigured && (
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-indigo-300">
                  <span className="flex items-center gap-1.5">
                    <Code2 className="w-4 h-4 text-indigo-400" />
                    已自动注入 SOCKS 5 链式出站与路由规则
                  </span>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    {resultModal.socksList.length} SOCKS Proxy
                  </span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">
                  {resultModal.socksExplanation}
                </p>

                {/* Collapsible / Viewable JSON Tabs */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Xray Outbounds JSON:</span>
                    <button
                      onClick={() => handleCopy(resultModal.xrayOutboundsJson, 'outboundsJson')}
                      className="text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      {copiedField === 'outboundsJson' ? '已复制' : '复制 Outbounds JSON'}
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-black/40 border border-white/10 text-[11px] font-mono text-zinc-300 max-h-32 overflow-y-auto leading-tight">
                    {resultModal.xrayOutboundsJson}
                  </pre>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setResultModal(null)}
                className="py-2.5 px-6 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 font-semibold text-sm transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

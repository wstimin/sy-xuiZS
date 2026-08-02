import React, { useState } from 'react';
import { 
  X, BookOpen, Terminal, Network, ShieldCheck, CheckCircle2, 
  HelpCircle, ChevronRight, Server, Key, Globe, Cpu, Sparkles, AlertTriangle, Layers
} from 'lucide-react';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectView?: (view: 'panel' | 'node') => void;
}

export const SetupGuideModal: React.FC<SetupGuideModalProps> = ({ isOpen, onClose, onSelectView }) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'panel' | 'node' | 'faq'>('quick');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0d0e12] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                xui面板与节点搭建使用教程
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  操作指南
                </span>
              </h2>
              <p className="text-xs text-zinc-400">新手零基础指南 · 一键部署 xui 面板、配置协议节点与 SOCKS5 链式代理</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-6 pt-3 pb-1 border-b border-white/10 flex items-center gap-2 overflow-x-auto bg-black/30">
          <button
            onClick={() => setActiveTab('quick')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'quick'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>三步快速指南</span>
          </button>

          <button
            onClick={() => setActiveTab('panel')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'panel'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>步骤一：搭建 xui 面板</span>
          </button>

          <button
            onClick={() => setActiveTab('node')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'node'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>步骤二：搭建节点 (含 SOCKS)</span>
          </button>

          <button
            onClick={() => setActiveTab('faq')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'faq'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>常见问题 FAQ</span>
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-zinc-300 custom-scrollbar">
          
          {/* TAB 1: 三步极速速览 */}
          {activeTab === 'quick' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs leading-relaxed flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block mb-0.5">本平台操作流程说明</strong>
                  填写服务器连接信息或 3x-ui 面板账号后，系统会通过真实 SSH 和官方 API 完成安装与节点创建。云厂商安全组仍需在云控制台手动放行，订阅地址仅在面板已启用订阅时返回。
                </div>
              </div>

              {/* Step Flow Cards */}
              <div className="grid md:grid-cols-3 gap-4">
                {/* Step 1 */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 relative overflow-hidden">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold font-mono text-xs flex items-center justify-center">
                    01
                  </div>
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-indigo-400" />
                    准备外网 VPS
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    准备一台 Linux 系统（Ubuntu/Debian）的外网服务器，在云控制台安全组中放行 SSH 端口（默认 22）。
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 relative overflow-hidden">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold font-mono text-xs flex items-center justify-center">
                    02
                  </div>
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    一键部署 xui 面板
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    输入 VPS IP 和 SSH 凭据，设置面板访问端口与路径，后台会自动安装 3x-ui 面板并生成随机安全登录账号密码。
                  </p>
                </div>

                {/* Step 3 */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 relative overflow-hidden">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold font-mono text-xs flex items-center justify-center">
                    03
                  </div>
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    <Network className="w-4 h-4 text-emerald-400" />
                    搭建节点并导入客户端
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    输入面板凭据或 Token，选择协议与可选 SOCKS5 链式代理，通过官方 API 创建入站并生成节点链接与二维码。
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-zinc-400">
                  选择下方功能模块开始操作：
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      onClose();
                      if (onSelectView) onSelectView('panel');
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-indigo-500/20"
                  >
                    <span>去搭建 xui 面板</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      if (onSelectView) onSelectView('node');
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    <span>去搭建节点</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 搭建 xui 面板指引 */}
          {activeTab === 'panel' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-indigo-400" />
                  搭建 xui 面板操作指南
                </h3>
                
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] flex items-center justify-center font-mono">1</span>
                      填入 VPS 服务器连接信息
                    </div>
                    <ul className="text-xs text-zinc-400 space-y-1 pl-6 list-disc">
                      <li><strong>服务器 IP / 域名</strong>：您购入的外网 Linux VPS 的公网 IP 地址（如 <code className="text-zinc-200">154.23.xx.xx</code>）。</li>
                      <li><strong>SSH 端口</strong>：默认通常为 <code className="text-zinc-200">22</code>。如果是自定义高位端口请填写修改后的端口。</li>
                      <li><strong>认证方式</strong>：支持“密码认证”或“私钥认证”。</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] flex items-center justify-center font-mono">2</span>
                      设置面板访问端口与安全路径
                    </div>
                    <ul className="text-xs text-zinc-400 space-y-1 pl-6 list-disc">
                      <li><strong>面板监听端口</strong>：推荐使用 <code className="text-indigo-300">2053</code>（或 8443 / 54321 等高位端口）。</li>
                      <li><strong>URL 访问路径</strong>：默认为 <code className="text-indigo-300">/xui</code>。防扫描加固建议改为个性化路径（如 <code className="text-indigo-300">/my-xui-path</code>）。</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] flex items-center justify-center font-mono">3</span>
                      提交并保存登录凭据
                    </div>
                    <p className="text-xs text-zinc-400 pl-6 leading-relaxed">
                      点击【一键搭建】后，后台将建立 SSH 通道在 VPS 上自动完成依赖补全与 3x-ui 安装。搭建完成后页面会弹窗显示完整的<strong>面板登录 URL、初始 Username 及高强度随机密码</strong>，请注意保存。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 搭建节点指引 (含 SOCKS) */}
          {activeTab === 'node' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Network className="w-5 h-5 text-emerald-400" />
                  搭建节点 (含 SOCKS 链式) 操作指南
                </h3>

                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs leading-relaxed flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>特色：支持免手动输入 Token + 协议冲突自动防错 + 支持落地 SOCKS5 链式代理！</span>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-center font-mono">1</span>
                      填入 xui 面板信息（搭建结果会自动带入 API Token）
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed pl-6">
                      从面板搭建结果跳转时，地址、账号、API Token 和 TLS 证书路径会自动填写。手动录入已有面板时请直接填写有效 Token。
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-center font-mono">2</span>
                      选择节点传输协议组合与指定监听端口
                    </div>
                    <div className="text-xs text-zinc-400 leading-relaxed pl-6 space-y-2">
                      <p>支持填写<strong>指定节点监听端口 (如 443, 8443, 2082)</strong>，留空则随机生成 (15000-55000)。协议推荐规则：</p>
                      <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                          <span className="text-emerald-300 font-semibold block">VLESS + TCP + Reality (首选)</span>
                          <span className="text-zinc-400">无需域名证书，自带真实 SNI 网站伪装，抗封锁性能极高。</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                          <span className="text-indigo-300 font-semibold block">VMess / Trojan + TLS</span>
                          <span className="text-zinc-400">配合已解析的域名 SSL 证书使用，兼容老旧客户端。</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-center font-mono">3</span>
                      SOCKS5 链式代理配置 (可选二次中继)
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed pl-6">
                      勾选“启用 SOCKS5 链式代理”并填入落地 SOCKS5 代理的 IP、端口与认证信息。系统会自动在面板中配置 Outbounds 转发，隐藏实际出站出口。
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-center font-mono">4</span>
                      生成与导入节点
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed pl-6">
                      生成后页面将显示真实节点分享链接和 Canvas 二维码。启用 SOCKS 时会显示实际写入的 Outbound 与 Routing JSON；面板启用订阅时才显示订阅地址。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 常见问题 FAQ */}
          {activeTab === 'faq' && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-purple-400" />
                常见问题与疑难解答 (FAQ)
              </h3>

              <div className="space-y-3 text-xs">
                {/* Q1 */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-bold text-purple-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0" />
                    Q: 搭建节点的时候不输入 Token 访问令牌能不能搭建成功？
                  </div>
                  <div className="text-zinc-300 leading-relaxed pl-6">
                    <strong>不能。</strong> 创建节点统一要求 API Token，并直接通过 Bearer Token 调用管理 API，避免重复登录和认证检查。
                  </div>
                </div>

                {/* Q2 */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-bold text-purple-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0" />
                    Q: 面板搭建时提示 SSH 连接超时或失败？
                  </div>
                  <div className="text-zinc-300 leading-relaxed pl-6">
                    请按以下点进行自查：
                    <ol className="list-decimal pl-4 mt-1 space-y-1 text-zinc-400">
                      <li>确认云服务商控制台（阿里云 / 腾讯云 / AWS / 搬瓦工等）安全组入站规则中，已经开启了 SSH 端口（默认 22）。</li>
                      <li>确认输入的 IP 地址与 root 密码/密钥正确无误。</li>
                    </ol>
                  </div>
                </div>

                {/* Q3 */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-bold text-purple-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0" />
                    Q: 生成的节点连接后无法联网或延迟显示为 -1？
                  </div>
                  <div className="text-zinc-300 leading-relaxed pl-6">
                    请检查 VPS 云控制台安全组是否放行了该节点设定的<strong>入站端口</strong>（例如 443、8443 或 2082 等）。如果开启了 SOCKS5 链式代理，请确保落地的 SOCKS5 代理服务器正常在线。
                  </div>
                </div>

                {/* Q4 */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-bold text-purple-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0" />
                    Q: 生成的历史记录会泄露给其他人吗？
                  </div>
                  <div className="text-zinc-300 leading-relaxed pl-6">
                    历史记录只保存时间、面板地址、协议和入站编号等非敏感元数据。密码、Token、节点分享链接与 SOCKS 凭据不会写入 localStorage。
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs">
          <div className="text-zinc-400 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>安全加密自动化运维助手</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all cursor-pointer"
          >
            关闭教程
          </button>
        </div>

      </div>
    </div>
  );
};

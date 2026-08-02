import React from 'react';
import { X, Layers, ShieldCheck, Check, AlertTriangle, Network } from 'lucide-react';

interface ProtocolMatrixGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProtocolMatrixGuideModal: React.FC<ProtocolMatrixGuideModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-[#0d0d12] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">xui面板 协议组合与冲突速查</h3>
              <p className="text-xs text-zinc-400">了解 VLESS, VMess, Trojan, Reality 与 SOCKS 链式中继机制</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Matrix Table */}
        <div className="space-y-4">
          <h4 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
            1. 常用协议与伪装加密兼容矩阵
          </h4>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-white/5 text-zinc-400 border-b border-white/10 font-mono">
                <tr>
                  <th className="p-3">主协议</th>
                  <th className="p-3">传输方式</th>
                  <th className="p-3">安全伪装</th>
                  <th className="p-3">推荐场景与冲突判定</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                <tr className="hover:bg-white/5">
                  <td className="p-3 font-bold text-indigo-300">VLESS</td>
                  <td className="p-3">TCP / gRPC</td>
                  <td className="p-3 text-emerald-400 font-semibold">Reality</td>
                  <td className="p-3 text-zinc-300">
                    <span className="text-emerald-400 font-medium">强烈推荐</span>：零证书申请，抗封锁能力强。WS 不支持 Reality。
                  </td>
                </tr>
                <tr className="hover:bg-white/5">
                  <td className="p-3 font-bold text-indigo-300">VLESS</td>
                  <td className="p-3">WebSocket</td>
                  <td className="p-3 text-indigo-400 font-semibold">TLS / None</td>
                  <td className="p-3 text-zinc-300">
                    可配合 CDN 隐蔽 IP，必须配置 TLS 证书。
                  </td>
                </tr>
                <tr className="hover:bg-white/5">
                  <td className="p-3 font-bold text-indigo-300">VMess</td>
                  <td className="p-3">WS / TCP</td>
                  <td className="p-3 text-indigo-400 font-semibold">TLS / None</td>
                  <td className="p-3 text-zinc-300">
                    <span className="text-amber-400 font-medium">不支持 Reality</span>：VMess 不支持 Reality 加密方式。
                  </td>
                </tr>
                <tr className="hover:bg-white/5">
                  <td className="p-3 font-bold text-indigo-300">Trojan</td>
                  <td className="p-3">TCP / gRPC / WS</td>
                  <td className="p-3 text-indigo-400 font-semibold">TLS</td>
                  <td className="p-3 text-zinc-300">
                    标准 443 端口 HTTPS 伪装，依赖真实 SSL 证书。
                  </td>
                </tr>
                <tr className="hover:bg-white/5">
                  <td className="p-3 font-bold text-indigo-300">Shadowsocks</td>
                  <td className="p-3">TCP / mKCP</td>
                  <td className="p-3 text-zinc-400 font-semibold">None</td>
                  <td className="p-3 text-zinc-300">
                    自带 AEAD 2022 算法密码，无需外层 TLS 或 Reality 覆盖。
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SOCKS Chain Proxy Principle */}
        <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2 text-xs">
          <h4 className="font-bold text-indigo-300 flex items-center gap-1.5">
            <Network className="w-4 h-4 text-indigo-400" />
            2. SOCKS 链式代理原理 (Chained Proxy)
          </h4>
          <p className="text-zinc-300 leading-relaxed">
            SOCKS 链式代理将用户的入口流量（Inbound）经由 ui面板 内部 Xray 路由规则分发转发至预设的 SOCKS 出站（Outbounds）。
          </p>
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 font-mono text-[11px] text-zinc-300 flex items-center justify-between">
            <span>[客户端] &rarr; [ui面板 入口节点] &rarr; [SOCKS 中继] &rarr; [目标网站]</span>
            <span className="text-emerald-400 font-semibold">自动隐藏入口 IP</span>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="py-2.5 px-6 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 font-medium text-sm transition-colors"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};

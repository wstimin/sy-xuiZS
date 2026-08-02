import React from 'react';
import { ViewMode } from '../types';
import { 
  Terminal, Network, ShieldCheck, Zap, ArrowRight, Layers, Lock, Cpu, Sparkles,
  BookOpen, Server, HelpCircle, ChevronRight
} from 'lucide-react';

interface HomeViewProps {
  onSelectView: (view: ViewMode) => void;
  onOpenGuide: () => void;
  onOpenSetupGuide?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onSelectView, onOpenGuide, onOpenSetupGuide }) => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-12">
      {/* Top Welcome & Mission Banner */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-inner text-xs font-mono text-indigo-300">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          轻量极速 · 专注 xui面板 部署与节点链式配置
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
          零繁琐步骤，<span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-emerald-400 bg-clip-text text-transparent">一键完成面板与节点搭建</span>
        </h1>
        <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
          不堆砌复杂的后台统计与运维看板，只专注帮您自动化完成 <strong className="text-zinc-200">xui面板 极速部署</strong> 与 <strong className="text-zinc-200">节点协议（支持 SOCKS 链式代理）构建</strong>。
        </p>
      </div>

      {/* Two Big Action Cards */}
      <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
        {/* Card 1: 搭建面板 */}
        <div
          onClick={() => onSelectView('panel')}
          className="group relative cursor-pointer rounded-3xl bg-white/5 border border-white/10 hover:border-indigo-500/50 p-6 sm:p-8 backdrop-blur-xl transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 hover:bg-white/[0.07] flex flex-col justify-between overflow-hidden"
        >
          {/* Subtle Ambient Background Gradient */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-500 pointer-events-none" />

          <div className="space-y-6 relative z-10">
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300">
                <Terminal className="w-7 h-7" />
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-white/5 text-indigo-300 border border-white/10">
                Step 01
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                搭建 xui面板
                <ArrowRight className="w-5 h-5 text-indigo-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </h2>
              <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                输入服务器 IP、SSH 端口及密码/私钥，通过官方安装器部署面板，并返回经过服务状态验证的登录入口信息。
              </p>
            </div>

            <ul className="space-y-2 text-xs text-zinc-300">
              <li className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>自动检测 Debian / Ubuntu / CentOS 架构并匹配环境</span>
              </li>
              <li className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>支持官方域名/IP SSL 模式，结果以安装器实际返回为准</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>提交即生成可直接执行的安装指令与登录凭据弹窗</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-medium text-indigo-400 group-hover:text-indigo-300">
            <span>进入面板部署表单</span>
            <span className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-500/20 group-hover:bg-indigo-500 transition-colors">
              立即搭建 &rarr;
            </span>
          </div>
        </div>

        {/* Card 2: 搭建节点 */}
        <div
          onClick={() => onSelectView('node')}
          className="group relative cursor-pointer rounded-3xl bg-white/5 border border-white/10 hover:border-emerald-500/50 p-6 sm:p-8 backdrop-blur-xl transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10 hover:bg-white/[0.07] flex flex-col justify-between overflow-hidden"
        >
          {/* Subtle Ambient Background Gradient */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-500 pointer-events-none" />

          <div className="space-y-6 relative z-10">
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-300">
                <Network className="w-7 h-7" />
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-white/5 text-emerald-300 border border-white/10">
                Step 02
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white group-hover:text-emerald-300 transition-colors flex items-center gap-2">
                搭建节点 (含 SOCKS 链式)
                <ArrowRight className="w-5 h-5 text-emerald-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </h2>
              <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                选协议（VLESS / VMess / Trojan / SS）、传输与安全类型，智能自动禁用冲突组合。支持粘贴多 SOCKS5 代理自动配置出站与中继路由！
              </p>
            </div>

            <ul className="space-y-2 text-xs text-zinc-300">
              <li className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>协议-传输-安全三者智能联动，冲突选项自动置灰变暗</span>
              </li>
              <li className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>支持 SOCKS 5 链式中继，自动写入 Outbounds 与路由分发规则</span>
              </li>
              <li className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>生成真实节点链接和二维码；面板启用订阅时返回订阅地址</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-medium text-emerald-400 group-hover:text-emerald-300">
            <span>进入节点与 SOCKS 配置</span>
            <span className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow-md shadow-emerald-500/20 group-hover:bg-emerald-500 transition-colors">
              立即构建 &rarr;
            </span>
          </div>
        </div>
      </div>

      {/* Embedded Setup Instructions Section */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                xui 面板与节点生成使用流程说明
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400">全程零命令敲写 · 跟着 3 步指南轻松完成节点搭建</p>
            </div>
          </div>

          {onOpenSetupGuide && (
            <button
              onClick={onOpenSetupGuide}
              className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-2 transition-all self-start sm:self-auto cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>查看完整使用教程</span>
            </button>
          )}
        </div>

        {/* 3 Step Instruction Flow */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Step 1 Block */}
          <div className="p-5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                准备工作
              </span>
              <Server className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-base font-bold text-white">1. 准备 VPS 服务器</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              准备一台 Ubuntu 或 Debian 系统的 Linux 外网 VPS，并在云厂商安全组放行 SSH 端口（默认 22）及面板端口（如 2053）。
            </p>
          </div>

          {/* Step 2 Block */}
          <div className="p-5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                第一步
              </span>
              <Terminal className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="text-base font-bold text-white">2. 点击【搭建面板】一键安装</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              填入服务器 IP、SSH 账号密码与访问端口路径。点击提交后后台全自动安装 3x-ui 面板，并生成初始网页入口与随机高强度密码。
            </p>
          </div>

          {/* Step 3 Block */}
          <div className="p-5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                第二步
              </span>
              <Network className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-base font-bold text-white">3. 点击【搭建节点】导出链接</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              面板搭建完成后会自动带入 <strong className="text-emerald-300">API Token</strong> 和 TLS 证书路径。选择协议或填入 SOCKS5 链式代理，快速创建节点并生成二维码！
            </p>
          </div>
        </div>

        {/* Quick FAQ Grid */}
        <div className="pt-4 border-t border-white/10 space-y-3">
          <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <span>核心使用问答 (FAQ)</span>
          </h3>

          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 space-y-1">
              <span className="font-semibold text-indigo-300 block">Q: 搭建节点时需要手动输入 Token 访问令牌吗？</span>
              <p className="text-zinc-400 leading-relaxed">
                答：<strong>从搭建结果进入节点页面时不需要</strong>，Token 会自动带入。手动录入已有面板时需要填写有效 Token，创建过程不会重复登录或读取 Token。
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 space-y-1">
              <span className="font-semibold text-emerald-300 block">Q: 节点协议推荐选哪种组合？</span>
              <p className="text-zinc-400 leading-relaxed">
                答：推荐选择 <strong>VLESS + TCP + Reality</strong>。无需申请 SSL 证书，且自带伪装 SNI 域名，直连速度快、抗封锁能力极高。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="pt-2 grid sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">智能冲突校验</h3>
            <p className="text-xs text-zinc-400 mt-1">
              例如 Reality 搭配 WebSocket 或 Trojan 选择 Reality 等不兼容模式时自动变灰，防错防踩坑。
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">SOCKS 链式中继</h3>
            <p className="text-xs text-zinc-400 mt-1">
              可批量输入前置 SOCKS 代理，自动注入 Xray 出站与路由规则，实现双重隐蔽与负载均衡。
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">标准一键输出</h3>
            <p className="text-xs text-zinc-400 mt-1">
              返回真实节点链接与可扫描二维码；订阅已在面板启用时返回订阅地址，SOCKS 启用时显示实际写入的出站和路由 JSON。
            </p>
          </div>
        </div>
      </div>

      {/* Bottom quick tip button */}
      <div className="text-center pt-2 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
        <button
          onClick={onOpenGuide}
          className="hover:text-indigo-300 underline underline-offset-4 transition-colors cursor-pointer"
        >
          查看常见协议组合说明 (VLESS/Reality/Trojan/SOCKS) &rarr;
        </button>

        {onOpenSetupGuide && (
          <button
            onClick={onOpenSetupGuide}
            className="hover:text-indigo-300 underline underline-offset-4 transition-colors cursor-pointer"
          >
            打开完整使用操作教程 &rarr;
          </button>
        )}
      </div>
    </div>
  );
};

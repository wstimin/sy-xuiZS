import React from 'react';
import { ViewMode } from '../types';
import { Terminal, Cpu, Network, History, HelpCircle, ShieldCheck, BookOpen } from 'lucide-react';

interface HeaderProps {
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  onOpenGuide: () => void;
  onOpenSetupGuide?: () => void;
  onOpenHistory: () => void;
  historyCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSelectView,
  onOpenGuide,
  onOpenSetupGuide,
  onOpenHistory,
  historyCount
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Branding */}
        <div 
          onClick={() => onSelectView('home')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-500 p-[1px] shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all duration-300">
            <div className="w-full h-full bg-[#0a0a0c] rounded-[11px] flex items-center justify-center">
              <Terminal className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">
                xui面板 <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-emerald-400 bg-clip-text text-transparent">一键搭建助手</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> Auto-Deploy
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden md:block">专注面板与节点搭建 · 支持协议联动与 SOCKS 链式代理</p>
          </div>
        </div>

        {/* View Switcher Navigation */}
        <nav className="flex items-center gap-1 sm:gap-2 bg-white/5 p-1 rounded-xl border border-white/10 shadow-inner">
          <button
            onClick={() => onSelectView('home')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              currentView === 'home'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>首页</span>
          </button>

          <button
            onClick={() => onSelectView('panel')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              currentView === 'panel'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>搭建面板</span>
          </button>

          <button
            onClick={() => onSelectView('node')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              currentView === 'node'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>搭建节点</span>
          </button>
        </nav>

        {/* Helper Action Tools */}
        <div className="flex items-center gap-2">
          {onOpenSetupGuide && (
            <button
              onClick={onOpenSetupGuide}
              title="查看 xui 面板与节点使用搭建指南"
              className="px-2.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-500/20 transition-all text-xs flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">使用说明</span>
            </button>
          )}

          <button
            onClick={onOpenGuide}
            title="协议冲突与速查规则"
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:border-indigo-500/40 hover:bg-white/10 transition-all text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <span className="hidden lg:inline">协议速查</span>
          </button>

          <button
            onClick={onOpenHistory}
            title="历史生成记录"
            className="relative p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:border-indigo-500/40 hover:bg-white/10 transition-all text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <History className="w-4 h-4 text-emerald-400" />
            <span className="hidden lg:inline">历史配置</span>
            {historyCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-indigo-600 text-white text-[10px] font-bold rounded-full">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

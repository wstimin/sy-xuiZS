import React from 'react';
import { HistoryItem } from '../types';
import { X, Terminal, Network, Copy, Trash2, ShieldCheck } from 'lucide-react';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onClearHistory: () => void;
  onCopyText: (text: string, title: string) => void;
  onSelectPanelToNode: (panelData: any) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onClearHistory,
  onCopyText,
  onSelectPanelToNode
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md h-full bg-[#0d0d12] border-l border-white/10 p-6 flex flex-col justify-between shadow-2xl space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-lg font-bold text-white">历史搭建与生成记录</h3>
              <p className="text-[11px] text-amber-300">面板密码与 Token 保存在当前浏览器本地，用于下次自动回填</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {items.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
              <p className="text-sm">暂无历史记录</p>
              <p className="text-xs text-zinc-600">搭建面板或节点后自动保存在本地</p>
            </div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 hover:border-white/20 transition-all"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-zinc-200">
                    {item.type === 'panel' ? (
                      <Terminal className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Network className="w-4 h-4 text-indigo-400" />
                    )}
                    {item.title}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">{item.timestamp}</span>
                </div>

                <p className="text-xs text-zinc-400 font-mono break-all">{item.summary}</p>

                {/* Card Actions */}
                <div className="pt-2 flex items-center justify-end gap-2 text-xs">
                  {item.type === 'panel' && item.panelData && (
                    <>
                      <button
                        onClick={() => {
                          if (item.panelData) {
                            onSelectPanelToNode(item.panelData);
                            onClose();
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[11px] font-medium cursor-pointer"
                      >
                        用作节点面板
                      </button>
                      <button
                        onClick={() => onCopyText(item.panelData?.accessUrl || item.summary || '', '面板链接')}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        title="复制面板地址"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {item.type === 'node' && <span className="text-[10px] text-zinc-500">敏感链接不留存</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Actions */}
        {items.length > 0 && (
          <div className="pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-zinc-500">共 {items.length} 条数据</span>
            <button
              onClick={onClearHistory}
              className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空记录
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

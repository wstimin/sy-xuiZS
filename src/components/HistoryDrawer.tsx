import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowRight,
  CalendarClock,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Network,
  QrCode,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  X
} from 'lucide-react';
import { HistoryItem, NodeResult, PanelResult } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onClearHistory: () => void;
  onCopyText: (text: string, title: string) => void;
  onSelectPanelToNode: (panelData: PanelResult) => void;
}

interface DetailFieldProps {
  label: string;
  value?: string | number | null;
  copyTitle?: string;
  onCopyText: (text: string, title: string) => void;
  wide?: boolean;
}

const DetailField: React.FC<DetailFieldProps> = ({
  label,
  value,
  copyTitle,
  onCopyText,
  wide = false
}) => {
  const text = value === undefined || value === null || value === '' ? '未记录' : String(value);
  const canCopy = text !== '未记录';

  return (
    <div className={`history-detail-field${wide ? ' is-wide' : ''}`}>
      <span className="history-detail-label">{label}</span>
      <div className="history-detail-value-row">
        <span className="history-detail-value">{text}</span>
        {canCopy && copyTitle && (
          <button
            type="button"
            onClick={() => onCopyText(text, copyTitle)}
            className="history-icon-button"
            title={`复制${copyTitle}`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const PanelHistoryDetail: React.FC<{
  data: PanelResult;
  onCopyText: (text: string, title: string) => void;
  onSelectPanelToNode: (panelData: PanelResult) => void;
  onClose: () => void;
}> = ({ data, onCopyText, onSelectPanelToNode, onClose }) => (
  <div className="history-detail-content">
    <div className="history-detail-heading">
      <div className="history-detail-icon history-detail-icon-panel">
        <Terminal className="h-5 w-5" />
      </div>
      <div>
        <h4>面板信息</h4>
        <p>可重新打开面板，或直接带入节点搭建页面。</p>
      </div>
    </div>

    <div className="history-primary-link">
      <div>
        <span>面板访问地址</span>
        <strong>{data.accessUrl}</strong>
      </div>
      <div className="history-primary-actions">
        <button type="button" onClick={() => onCopyText(data.accessUrl, '面板地址')} title="复制面板地址">
          <Copy className="h-4 w-4" />
        </button>
        <a href={data.accessUrl} target="_blank" rel="noopener noreferrer" title="打开面板">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>

    <div className="history-detail-grid">
      <DetailField label="主机" value={data.host} copyTitle="主机" onCopyText={onCopyText} />
      <DetailField label="端口" value={data.port} copyTitle="端口" onCopyText={onCopyText} />
      <DetailField label="访问路径" value={data.path} copyTitle="访问路径" onCopyText={onCopyText} />
      <DetailField label="协议 / 加密" value={`${data.protocol.toUpperCase()} / ${data.sslEnabled ? '已启用' : '未启用'}`} onCopyText={onCopyText} />
      <DetailField label="登录账号" value={data.username} copyTitle="登录账号" onCopyText={onCopyText} />
      <DetailField label="登录密码" value={data.password} copyTitle="登录密码" onCopyText={onCopyText} />
      <DetailField label="接口令牌" value={data.apiToken} copyTitle="接口令牌" onCopyText={onCopyText} wide />
      <DetailField label="面板类型" value="官方脚本" onCopyText={onCopyText} />
      <DetailField label="证书文件" value={data.webCertFile} copyTitle="证书文件路径" onCopyText={onCopyText} />
      <DetailField label="私钥文件" value={data.webKeyFile} copyTitle="私钥文件路径" onCopyText={onCopyText} wide />
    </div>

    <button
      type="button"
      onClick={() => {
        onSelectPanelToNode(data);
        onClose();
      }}
      className="history-use-panel-button"
    >
      <span>复用此面板搭建节点</span>
      <ArrowRight className="h-4 w-4" />
    </button>
  </div>
);

const NodeHistoryDetail: React.FC<{
  data: NodeResult;
  onCopyText: (text: string, title: string) => void;
}> = ({ data, onCopyText }) => {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    if (!qrCanvasRef.current || !data.shareLink) return;
    setQrError(false);
    void QRCode.toCanvas(qrCanvasRef.current, data.shareLink, {
      width: 208,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' }
    }).catch(() => setQrError(true));
  }, [data.shareLink]);

  return (
    <div className="history-detail-content">
      <div className="history-detail-heading">
        <div className="history-detail-icon history-detail-icon-node">
          <Network className="h-5 w-5" />
        </div>
        <div>
          <h4>{data.nodeName}</h4>
          <p>扫码导入客户端，也可以复制分享链接或订阅地址。</p>
        </div>
      </div>

      <div className="history-node-import">
        <div className="history-qr-box">
          {qrError ? (
            <div className="history-qr-error"><QrCode className="h-8 w-8" /><span>二维码生成失败</span></div>
          ) : (
            <canvas ref={qrCanvasRef} aria-label="节点分享链接二维码" />
          )}
        </div>
        <div className="history-node-links">
          <div className="history-link-block">
            <span><Link2 className="h-3.5 w-3.5" />节点分享链接</span>
            <p>{data.shareLink}</p>
            <button type="button" onClick={() => onCopyText(data.shareLink, '节点分享链接')}>
              <Copy className="h-3.5 w-3.5" />复制链接
            </button>
          </div>
          {data.subscriptionUrl && (
            <div className="history-link-block history-link-block-subscription">
              <span><QrCode className="h-3.5 w-3.5" />订阅地址</span>
              <p>{data.subscriptionUrl}</p>
              <button type="button" onClick={() => onCopyText(data.subscriptionUrl || '', '订阅地址')}>
                <Copy className="h-3.5 w-3.5" />复制订阅
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="history-detail-grid">
        <DetailField label="协议" value={data.protocol} onCopyText={onCopyText} />
        <DetailField label="传输方式" value={data.transport} onCopyText={onCopyText} />
        <DetailField label="安全方式" value={data.security} onCopyText={onCopyText} />
        <DetailField label="入站编号" value={data.inboundId} copyTitle="入站编号" onCopyText={onCopyText} />
        <DetailField label="入站标签" value={data.inboundTag} copyTitle="入站标签" onCopyText={onCopyText} />
        <DetailField label="入站端口" value={data.inboundPort} copyTitle="入站端口" onCopyText={onCopyText} />
        <DetailField label="UUID / 密码" value={data.uuid} copyTitle="UUID" onCopyText={onCopyText} wide />
      </div>

      {data.realityParamsUsed && (
        <section className="history-config-section">
          <div className="history-config-title"><KeyRound className="h-4 w-4" />Reality 参数</div>
          <div className="history-detail-grid">
            <DetailField label="SNI" value={data.realityParamsUsed.sni} copyTitle="SNI" onCopyText={onCopyText} />
            <DetailField label="Short ID" value={data.realityParamsUsed.shortId} copyTitle="Short ID" onCopyText={onCopyText} />
            <DetailField label="Public Key" value={data.realityParamsUsed.publicKey} copyTitle="Public Key" onCopyText={onCopyText} wide />
          </div>
        </section>
      )}

      {data.socksConfigured && (
        <section className="history-config-section">
          <div className="history-config-title"><Server className="h-4 w-4" />SOCKS 链式代理</div>
          <p className="history-config-description">{data.socksExplanation || `已配置 ${data.socksList.length} 个 SOCKS 代理。`}</p>
          <div className="history-config-actions">
            <button type="button" onClick={() => onCopyText(data.xrayOutboundsJson, '出站配置')}>
              <Copy className="h-3.5 w-3.5" />复制出站配置
            </button>
            <button type="button" onClick={() => onCopyText(data.xrayRoutingJson, '路由配置')}>
              <Copy className="h-3.5 w-3.5" />复制路由配置
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onClearHistory,
  onCopyText,
  onSelectPanelToNode
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  const selectedItem = useMemo(
    () => items.find(item => item.id === selectedId) || items[0] || null,
    [items, selectedId]
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(current => items.some(item => item.id === current) ? current : items[0]?.id || null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, items, onClose]);

  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [selectedItem?.id]);

  if (!isOpen) return null;

  return (
    <div
      className="history-modal-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
        <header className="history-modal-header">
          <div className="history-modal-title-wrap">
            <div className="history-modal-title-icon"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <h3 id="history-modal-title">历史配置</h3>
              <p>服务器只保留脱敏任务摘要，完整搭建信息不会上传。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="history-modal-close" title="关闭历史配置">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="history-local-notice" role="note">
          <ShieldCheck className="h-5 w-5" />
          <div>
            <strong>敏感信息仅保存在当前账号的此浏览器中</strong>
            <span>密码、API Token 和节点链接不会保存到服务器；换浏览器、使用无痕模式或清理网站数据后将无法恢复，请仅在受信任设备使用。</span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="history-empty-state">
            <CalendarClock className="h-9 w-9" />
            <strong>暂无历史配置</strong>
            <span>完成面板搭建或节点生成后，结果会自动保存在这里。</span>
          </div>
        ) : (
          <div className="history-modal-body">
            <aside className="history-record-list" aria-label="历史记录列表">
              <div className="history-record-list-heading">
                <span>配置记录</span>
                <strong>{items.length}</strong>
              </div>
              <div className="history-record-list-scroll">
                {items.map(item => {
                  const hasDetails = item.hasDetails || (item.type === 'panel' ? Boolean(item.panelData) : Boolean(item.nodeData));
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`history-record-card${selectedItem?.id === item.id ? ' is-active' : ''}`}
                    >
                      <span className={`history-record-icon ${item.type === 'panel' ? 'is-panel' : 'is-node'}`}>
                        {item.type === 'panel' ? <Terminal className="h-4 w-4" /> : <Network className="h-4 w-4" />}
                      </span>
                      <span className="history-record-copy">
                        <strong>{item.title}</strong>
                        <small>{formatTimestamp(item.timestamp)}</small>
                        <span>{hasDetails ? item.summary : '该记录仅保留摘要，无法读取完整信息'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main ref={detailRef} className="history-record-detail">
              {selectedItem?.type === 'panel' && selectedItem.panelData && (
                <PanelHistoryDetail
                  data={selectedItem.panelData}
                  onCopyText={onCopyText}
                  onSelectPanelToNode={onSelectPanelToNode}
                  onClose={onClose}
                />
              )}
              {selectedItem?.type === 'node' && selectedItem.nodeData && (
                <NodeHistoryDetail data={selectedItem.nodeData} onCopyText={onCopyText} />
              )}
              {selectedItem && !selectedItem.panelData && !selectedItem.nodeData && (
                <div className="history-legacy-state">
                  <CalendarClock className="h-8 w-8" />
                  <strong>此浏览器没有这条记录的敏感详情</strong>
                  <p>它可能由旧版本、另一台设备或其他浏览器创建。服务器从不保存密码、接口令牌和节点链接，因此无法从服务器恢复。</p>
                  <code>{selectedItem.summary}</code>
                </div>
              )}
            </main>
          </div>
        )}

        <footer className="history-modal-footer">
          <span>清空会删除此浏览器的本地详情及服务器脱敏摘要，操作后无法恢复。</span>
          {items.length > 0 && (
            <button type="button" onClick={onClearHistory} className="history-clear-button">
              <Trash2 className="h-3.5 w-3.5" />清空记录
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};

import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AdminDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'warning' | 'success';
  busy?: boolean;
  confirmDisabled?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

export const AdminDialog: React.FC<AdminDialogProps> = ({
  open,
  title,
  description,
  children,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'primary',
  busy = false,
  confirmDisabled = false,
  onClose,
  onConfirm,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
        <header>
          <div className="admin-dialog-heading">
            {tone === 'danger' || tone === 'warning' ? <span className={`admin-dialog-alert ${tone}`}><AlertTriangle /></span> : null}
            <div><h2 id="admin-dialog-title">{title}</h2>{description && <p>{description}</p>}</div>
          </div>
          <button type="button" className="admin-icon-button" onClick={onClose} disabled={busy} title="关闭"><X /></button>
        </header>
        {children && <div className="admin-dialog-body">{children}</div>}
        <footer>
          <button type="button" className="admin-button secondary" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          {onConfirm && <button type="button" className={`admin-button ${tone}`} onClick={onConfirm} disabled={busy || confirmDisabled}>{busy ? '正在处理...' : confirmLabel}</button>}
        </footer>
      </section>
    </div>
  );
};

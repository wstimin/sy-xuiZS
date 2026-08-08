import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, PanelsTopLeft, X } from 'lucide-react';

interface AdminDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: React.ReactNode;
  size?: 'default' | 'wide';
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
  size = 'default',
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'primary',
  busy = false,
  confirmDisabled = false,
  onClose,
  onConfirm,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  busyRef.current = busy;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onCloseRef.current();
    };
    const focusFirstControl = window.requestAnimationFrame(() => {
      const firstControl = dialogRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([disabled])');
      firstControl?.focus();
    });
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} className={`admin-dialog ${size === 'wide' ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header>
          <div className="admin-dialog-heading">
            <span className={`admin-dialog-symbol ${tone}`}>{tone === 'danger' || tone === 'warning' ? <AlertTriangle /> : <PanelsTopLeft />}</span>
            <div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>
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

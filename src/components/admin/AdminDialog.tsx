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
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  busyRef.current = busy;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || [])
        .filter(control => !control.hasAttribute('disabled') && control.offsetParent !== null);
      if (!controls.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusFirstControl = window.requestAnimationFrame(() => {
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || []);
      const preferredControl = controls.find(control => control.dataset.dialogClose !== 'true') || controls[0];
      (preferredControl || dialogRef.current)?.focus();
    });
    document.addEventListener('keydown', handleDialogKeys);
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      document.removeEventListener('keydown', handleDialogKeys);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => previouslyFocusedRef.current?.focus());
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} className={`admin-dialog ${size === 'wide' ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
        <header>
          <div className="admin-dialog-heading">
            <span className={`admin-dialog-symbol ${tone}`}>{tone === 'danger' || tone === 'warning' ? <AlertTriangle /> : <PanelsTopLeft />}</span>
            <div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>
          </div>
          <button type="button" className="admin-icon-button" onClick={onClose} disabled={busy} title="关闭" aria-label="关闭弹窗" data-dialog-close="true"><X /></button>
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

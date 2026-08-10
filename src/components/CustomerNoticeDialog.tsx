import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface CustomerNoticeDialogProps {
  open: boolean;
  tone: 'warning' | 'success';
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const CustomerNoticeDialog: React.FC<CustomerNoticeDialogProps> = ({
  open,
  tone,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    const focusConfirm = window.requestAnimationFrame(() => confirmRef.current?.focus());
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusConfirm);
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="customer-notice-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`customer-notice-dialog ${tone}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <button type="button" className="customer-notice-close" onClick={onClose} title="关闭"><X /></button>
        <span className="customer-notice-icon">{tone === 'success' ? <CheckCircle2 /> : <AlertTriangle />}</span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="customer-notice-actions">
          {cancelLabel && <button type="button" className="secondary" onClick={onClose}>{cancelLabel}</button>}
          <button ref={confirmRef} type="button" className="primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
};

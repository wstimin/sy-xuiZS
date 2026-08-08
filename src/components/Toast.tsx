import React from 'react';
import { ToastMessage } from '../types';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="admin-toast-stack" role="region" aria-label="系统通知">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className={`admin-toast ${isSuccess ? 'success' : isError ? 'error' : isWarning ? 'warning' : 'info'}`}
          >
            {isSuccess && <CheckCircle2 aria-hidden="true" />}
            {isError && <AlertCircle aria-hidden="true" />}
            {isWarning && <AlertTriangle aria-hidden="true" />}
            {!isSuccess && !isError && !isWarning && <Info aria-hidden="true" />}
            <div className="admin-toast-content">
              <strong>{toast.title}</strong>
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="admin-toast-close"
              aria-label="关闭通知"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

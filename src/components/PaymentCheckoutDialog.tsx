import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Clock3, ExternalLink, LoaderCircle, QrCode, X } from 'lucide-react';
import { api, formatMoney, Order, PaymentCheckout } from '../commercial';

interface PaymentCheckoutDialogProps {
  order: Order;
  payment: PaymentCheckout;
  onClose: () => void;
  onPaid: () => void;
}

export const PaymentCheckoutDialog: React.FC<PaymentCheckoutDialogProps> = ({ order, payment, onClose, onPaid }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState(order.status);

  useEffect(() => {
    if (payment.checkoutType !== 'qrcode' || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, payment.checkoutUrl, { width: 228, margin: 1, color: { dark: '#111827', light: '#ffffff' } });
  }, [payment]);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const result = await api<{ order: Order }>(`/api/orders/${order.id}/status`);
        if (stopped) return;
        setStatus(result.order.status);
        if (result.order.status === 'paid') {
          onPaid();
          return;
        }
        if (result.order.status === 'pending') window.setTimeout(check, 2500);
      } catch {
        if (!stopped) window.setTimeout(check, 4000);
      }
    };
    void check();
    return () => { stopped = true; };
  }, [order.id, onPaid]);

  return <div className="payment-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="payment-checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={event => event.stopPropagation()}>
      <header><div><span>安全收银台</span><h2 id="checkout-title">请完成扫码支付</h2></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header>
      <div className="payment-checkout-summary"><div><span>订单号</span><strong>{order.orderNo}</strong></div><div><span>应付金额</span><strong>{formatMoney(order.amountCents)}</strong></div></div>
      <div className="payment-qr-stage">
        <div className="payment-qr-frame"><canvas ref={canvasRef} /></div>
        <div><QrCode /><strong>使用对应支付应用扫码</strong><p>付款后无需手动提交，系统确认到账后会自动发放套餐权益。</p></div>
      </div>
      <div className={`payment-live-status ${status}`}>
        {status === 'paid' ? <CheckCircle2 /> : status === 'pending' ? <LoaderCircle className="animate-spin" /> : <Clock3 />}
        <span>{status === 'paid' ? '支付成功，权益已经发放' : status === 'pending' ? '正在等待支付结果...' : '订单已结束，请关闭后查看订单记录'}</span>
      </div>
      <a className="payment-open-link" href={payment.checkoutUrl} target="_blank" rel="noreferrer"><ExternalLink /> 无法扫码时打开支付链接</a>
    </section>
  </div>;
};

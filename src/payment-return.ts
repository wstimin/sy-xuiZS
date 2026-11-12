export function returnedPaymentOrderId(search: string): string | null {
  const query = new URLSearchParams(search);
  const directOrderId = query.get('payment_return');
  if (directOrderId) return directOrderId;
  if (query.get('payment') !== 'return' && query.get('payment') !== 'success') return null;
  // Some EPay gateways return an HTML-escaped URL verbatim, producing amp;order.
  return query.get('order') || query.get('amp;order');
}

export function paymentReturnPath(kind?: string): string {
  return kind === 'wallet_topup' ? '/console/account/overview' : '/console/pricing';
}

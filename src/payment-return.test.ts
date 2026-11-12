import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentReturnPath, returnedPaymentOrderId } from './payment-return';

test('payment return accepts the single-parameter URL and legacy gateway variants', () => {
  assert.equal(returnedPaymentOrderId('?payment_return=order-1&pid=1000'), 'order-1');
  assert.equal(returnedPaymentOrderId('?payment=return&order=order-2'), 'order-2');
  assert.equal(returnedPaymentOrderId('?payment=return&amp;order=order-3&trade_status=TRADE_SUCCESS'), 'order-3');
  assert.equal(returnedPaymentOrderId('?payment=success&order=order-4'), 'order-4');
  assert.equal(returnedPaymentOrderId('?payment=cancel&order=order-5'), null);
});

test('successful purchase stays on pricing while top-up returns to the account', () => {
  assert.equal(paymentReturnPath('wallet_topup'), '/console/account/overview');
  assert.equal(paymentReturnPath('purchase'), '/console/pricing');
  assert.equal(paymentReturnPath(), '/console/pricing');
});

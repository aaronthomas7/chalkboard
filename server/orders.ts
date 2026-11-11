// Turns a cart into a PayPal checkout paid to the shop, and records payment once the buyer approves.
import { randomInt, randomUUID } from 'node:crypto';
import type { Order, OrderLine } from '../shared/types.ts';
import { config } from './config.ts';
import { approvalUrl, captureOrder, createOrder, getOrder as getPayPalOrder, PayPalError } from './paypal.ts';
import { getShop, saveOrder } from './store.ts';

export type CheckoutRequest = {
  items: { item_id: string; quantity: number }[];
  pickup_time: string;
  customer_name: string;
  note: string;
};

// A problem the customer can fix, e.g. a sold-out item. The message is safe to show them.
export class CheckoutError extends Error {}

const cents = (amount: number) => Math.round(amount * 100);

// Easy to read aloud at the counter: no 0/O or 1/I.
function orderNumber(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

export async function createCheckout(shopSlug: string, request: CheckoutRequest): Promise<Order> {
  // Prices and availability always come from the shop's current menu, never from the request.
  const shop = getShop(shopSlug);
  if (!shop) throw new CheckoutError('This shop no longer exists.');
  if (request.items.length === 0) throw new CheckoutError('The order is empty.');

  const lines: OrderLine[] = [];
  for (const { item_id, quantity } of request.items) {
    const item = shop.items.find((candidate) => candidate.id === item_id);
    if (!item) throw new CheckoutError(`There is no menu item with id ${item_id}.`);
    if (!item.available) throw new CheckoutError(`${item.name} is sold out.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new CheckoutError(`The quantity of ${item.name} must be between 1 and 50.`);
    }
    const line = lines.find((existing) => existing.itemId === item.id);
    if (line) line.quantity += quantity;
    else lines.push({ itemId: item.id, name: item.name, quantity, unitPrice: item.price });
  }

  const totalCents = lines.reduce((sum, line) => sum + cents(line.unitPrice) * line.quantity, 0);
  const money = (amountCents: number) => ({ currency_code: shop.currency, value: (amountCents / 100).toFixed(2) });
  const id = randomUUID();

  let paypalOrder;
  try {
    paypalOrder = await createOrder({
      description: `Pickup order from ${shop.name}`,
      amount: money(totalCents),
      items: lines.map((line) => ({
        name: line.name.slice(0, 127),
        quantity: String(line.quantity),
        unit_amount: money(cents(line.unitPrice)),
      })),
      brandName: shop.name,
      payeeEmail: shop.paypalEmail,
      referenceId: id,
      customId: id,
      returnUrl: `${config.publicUrl}/paypal/return`,
      cancelUrl: `${config.publicUrl}/paypal/cancel`,
    });
  } catch (err) {
    if (err instanceof PayPalError) {
      console.error(err.message, err.issues, err.debugId);
      throw new CheckoutError("PayPal couldn't start the payment for this shop. Please try again in a moment.");
    }
    throw err;
  }

  const url = approvalUrl(paypalOrder);
  if (!url) throw new CheckoutError("PayPal didn't return a payment link. Please try again.");

  return saveOrder({
    id,
    number: orderNumber(),
    shopSlug: shop.slug,
    shopName: shop.name,
    currency: shop.currency,
    lines,
    total: totalCents / 100,
    customerName: request.customer_name.trim(),
    pickupTime: request.pickup_time.trim(),
    note: request.note.trim(),
    status: 'awaiting_payment',
    paypalOrderId: paypalOrder.id,
    approvalUrl: url,
    createdAt: new Date().toISOString(),
  });
}

// The PayPal return page and the buyer's status polling can both try to settle the same order.
const settling = new Map<string, Promise<Order>>();

// Captures the payment once the buyer has approved it on PayPal. Safe to call repeatedly.
export function settleOrder(order: Order): Promise<Order> {
  if (order.status === 'paid') return Promise.resolve(order);
  let pending = settling.get(order.id);
  if (!pending) {
    pending = settle(order).finally(() => settling.delete(order.id));
    settling.set(order.id, pending);
  }
  return pending;
}

async function settle(order: Order): Promise<Order> {
  let paypalOrder = await getPayPalOrder(order.paypalOrderId);
  if (paypalOrder.status === 'APPROVED') paypalOrder = await captureOrder(order.paypalOrderId);
  if (paypalOrder.status !== 'COMPLETED') return order;

  const capture = paypalOrder.purchase_units[0]?.payments?.captures?.[0];
  if (!capture || (capture.status !== 'COMPLETED' && capture.status !== 'PENDING')) return order;
  const net = capture.seller_receivable_breakdown?.net_amount;

  return saveOrder({
    ...order,
    status: 'paid',
    paidAt: new Date().toISOString(),
    captureId: capture.id,
    shopReceives: net ? `${net.value} ${net.currency_code}` : undefined,
  });
}

// Minimal PayPal REST client (sandbox): OAuth token caching plus the Orders v2 calls Chalkboard uses.
import { randomUUID } from 'node:crypto';
import { config } from './config.ts';

export type Money = { currency_code: string; value: string };
export type Payee = { email_address?: string; merchant_id?: string };

export type Capture = {
  id: string;
  status: string;
  status_details?: { reason?: string };
  amount: Money;
  seller_receivable_breakdown?: { gross_amount: Money; paypal_fee?: Money; net_amount?: Money };
};

export type PurchaseUnit = {
  reference_id?: string;
  description?: string;
  amount: Money;
  payee?: Payee;
  payments?: { captures?: Capture[] };
};

export type Order = {
  id: string;
  status: string;
  purchase_units: PurchaseUnit[];
  links?: { href: string; rel: string; method?: string }[];
};

type ErrorBody = {
  name?: string;
  message?: string;
  error?: string;
  error_description?: string;
  debug_id?: string;
  details?: { issue: string; description?: string }[];
};

export class PayPalError extends Error {
  status: number;
  code: string;
  issues: string[];
  debugId?: string;

  constructor(status: number, body: ErrorBody) {
    const code = body.name ?? body.error ?? 'ERROR';
    super(`PayPal ${status} ${code}: ${body.message ?? body.error_description ?? 'request failed'}`);
    this.status = status;
    this.code = code;
    this.issues = (body.details ?? []).map((d) => d.issue);
    this.debugId = body.debug_id;
  }
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const { apiBase, clientId, clientSecret } = config.paypal;
  if (!clientId || !clientSecret) {
    throw new Error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env (see .env.example).');
  }
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json();
  if (!res.ok) throw new PayPalError(res.status, body);

  // Refresh a minute early so a token never expires mid-request.
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return cachedToken.value;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.paypal.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(method === 'POST' && { 'PayPal-Request-Id': randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalError(res.status, json);
  return json as T;
}

export type LineItem = { name: string; quantity: string; unit_amount: Money };

export type NewOrder = {
  description: string;
  amount: Money;
  brandName: string;
  returnUrl: string;
  cancelUrl: string;
  referenceId?: string;
  customId?: string;
  // Shown to the buyer on PayPal. Their unit prices must add up to amount.
  items?: LineItem[];
  // The shop's PayPal email. Omit it and the money goes to the account that owns the app.
  payeeEmail?: string;
};

export function createOrder(order: NewOrder): Promise<Order> {
  return request<Order>('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: order.referenceId,
        custom_id: order.customId,
        description: order.description,
        amount: order.items
          ? { ...order.amount, breakdown: { item_total: order.amount } }
          : order.amount,
        items: order.items,
        ...(order.payeeEmail && { payee: { email_address: order.payeeEmail } }),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: order.brandName,
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: order.returnUrl,
          cancel_url: order.cancelUrl,
        },
      },
    },
  });
}

export function captureOrder(orderId: string): Promise<Order> {
  return request<Order>('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`);
}

export function getOrder(orderId: string): Promise<Order> {
  return request<Order>('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

// The page where the buyer logs in to PayPal and approves the payment.
export function approvalUrl(order: Order): string | undefined {
  return order.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
}

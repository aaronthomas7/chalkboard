import { useEffect, useState } from 'react';
import type { ChatReply, MenuDraft, MenuItem, NewShop, Order, PublishedShop, Shop } from '../../shared/types.ts';

async function request<T>(method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, ownerKey?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (ownerKey) headers['x-owner-key'] = ownerKey;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

const shopUrl = (slug: string) => `/api/shops/${encodeURIComponent(slug)}`;

export const readMenu = (image: string) => request<MenuDraft>('POST', '/api/menu/read', { image });
export const publishShop = (shop: NewShop) => request<PublishedShop>('POST', '/api/shops', shop);
export const getShop = (slug: string) => request<Shop>('GET', shopUrl(slug));
export const getOrder = (id: string) => request<Order>('GET', `/api/orders/${encodeURIComponent(id)}`);

export const sendChat = (slug: string, conversationId: string, message: string) =>
  request<ChatReply>('POST', `${shopUrl(slug)}/chat`, { conversationId, message });

export const getOrders = (slug: string, ownerKey: string) =>
  request<Order[]>('GET', `${shopUrl(slug)}/orders`, undefined, ownerKey);

export const saveItems = (slug: string, ownerKey: string, items: MenuItem[]) =>
  request<Shop>('PUT', `${shopUrl(slug)}/items`, { items }, ownerKey);

// Keeps an order fresh until it's paid. Each check also lets the server capture an approved payment.
export function useOrder(initial: Order): Order {
  const [order, setOrder] = useState(initial);
  useEffect(() => {
    if (order.status === 'paid') return;
    const timer = setInterval(() => {
      getOrder(order.id).then(setOrder, () => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [order.id, order.status]);
  return order;
}

export function formatPrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

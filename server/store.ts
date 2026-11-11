// Shops and orders live in memory and are mirrored to JSON files so they survive restarts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Order, Shop } from '../shared/types.ts';

export type StoredShop = Shop & { ownerKey: string };

const dataDir = path.resolve(process.env.DATA_DIR || 'data');

function load<T>(name: string, key: (value: T) => string): Map<string, T> {
  const file = path.join(dataDir, name);
  const values: T[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  return new Map(values.map((value) => [key(value), value]));
}

function persist(name: string, values: Map<string, unknown>) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, name), JSON.stringify([...values.values()], null, 2));
}

const shops = load<StoredShop>('shops.json', (shop) => shop.slug);
const orders = load<Order>('orders.json', (order) => order.id);

export function getShop(slug: string): StoredShop | undefined {
  return shops.get(slug);
}

export function saveShop(shop: StoredShop): StoredShop {
  shops.set(shop.slug, shop);
  persist('shops.json', shops);
  return shop;
}

// Everything except the owner's secret.
export function publicShop({ ownerKey: _ownerKey, ...shop }: StoredShop): Shop {
  return shop;
}

export function uniqueSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'shop';
  let slug = base;
  for (let n = 2; shops.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function findOrderByPayPalId(paypalOrderId: string): Order | undefined {
  return [...orders.values()].find((order) => order.paypalOrderId === paypalOrderId);
}

export function listOrders(shopSlug: string): Order[] {
  return [...orders.values()]
    .filter((order) => order.shopSlug === shopSlug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveOrder(order: Order): Order {
  orders.set(order.id, order);
  persist('orders.json', orders);
  return order;
}

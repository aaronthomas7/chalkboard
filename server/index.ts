import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import express, { type ErrorRequestHandler, type Request } from 'express';
import { z } from 'zod';
import type { PublishedShop } from '../shared/types.ts';
import { chat } from './agent.ts';
import { config } from './config.ts';
import { IMAGE_TYPES, readMenu, type ImageType } from './menu.ts';
import { settleOrder } from './orders.ts';
import { seedSampleShop } from './sample.ts';
import {
  findOrderByPayPalId,
  getOrder,
  getShop,
  listOrders,
  publicShop,
  saveShop,
  uniqueSlug,
  type StoredShop,
} from './store.ts';

const app = express();
app.use(express.json({ limit: '25mb' }));

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function shopFor(req: Request): StoredShop {
  const shop = getShop(String(req.params.slug));
  if (!shop) throw new HttpError(404, 'No shop with that link.');
  return shop;
}

// The owner dashboard sends the secret it was given when the shop was published.
function ownedShop(req: Request): StoredShop {
  const shop = shopFor(req);
  if (req.get('x-owner-key') !== shop.ownerKey) throw new HttpError(403, 'This dashboard link is not valid.');
  return shop;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    paypalConfigured: Boolean(config.paypal.clientId && config.paypal.clientSecret),
  });
});

// Turns a photo of the menu board into a draft catalog for the owner to review.
app.post('/api/menu/read', async (req, res) => {
  const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(req.body?.image ?? ''));
  if (!match || !IMAGE_TYPES.includes(match[1] as ImageType)) {
    throw new HttpError(400, 'Send the photo as a JPEG, PNG, WebP or GIF data URL.');
  }
  res.json(await readMenu(match[2], match[1] as ImageType));
});

const Item = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Every item needs a name.'),
  description: z.string(),
  category: z.string(),
  price: z.number().positive('Every item needs a price above 0.'),
  tags: z.array(z.string()),
  available: z.boolean(),
  unsure: z.array(z.string()),
  note: z.string(),
});

const ShopInput = z.object({
  name: z.string().trim().min(1, 'Give your shop a name.'),
  paypalEmail: z.email('Enter the PayPal email that should receive payments.'),
  currency: z.string().length(3),
  info: z.object({ hours: z.string(), location: z.string(), notes: z.array(z.string()) }),
  items: z.array(Item).min(1, 'Add at least one item.'),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
  return parsed.data;
}

app.post('/api/shops', (req, res) => {
  const input = parse(ShopInput, req.body);
  const shop = saveShop({
    ...input,
    slug: uniqueSlug(input.name),
    createdAt: new Date().toISOString(),
    ownerKey: randomBytes(18).toString('base64url'),
  });
  res.status(201).json({ shop: publicShop(shop), ownerKey: shop.ownerKey } satisfies PublishedShop);
});

app.get('/api/shops/:slug', (req, res) => {
  res.json(publicShop(shopFor(req)));
});

app.put('/api/shops/:slug/items', (req, res) => {
  const shop = ownedShop(req);
  const items = parse(z.array(Item).min(1, 'Keep at least one item on the menu.'), req.body?.items);
  res.json(publicShop(saveShop({ ...shop, items })));
});

app.get('/api/shops/:slug/orders', (req, res) => {
  res.json(listOrders(ownedShop(req).slug));
});

const ChatInput = z.object({
  conversationId: z.string().min(8).max(100),
  message: z.string().trim().min(1, 'Type a message.').max(1000, 'That message is too long.'),
});

app.post('/api/shops/:slug/chat', async (req, res) => {
  const shop = shopFor(req);
  const { conversationId, message } = parse(ChatInput, req.body);
  res.json(await chat(publicShop(shop), conversationId, message));
});

// Public order status. Checking also captures a payment the buyer approved but didn't return from.
app.get('/api/orders/:id', async (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) throw new HttpError(404, 'No order with that link.');
  res.json(await settleOrder(order));
});

// PayPal sends the buyer here after they approve (or cancel), with the PayPal order id as `token`.
app.get(['/paypal/return', '/paypal/cancel'], async (req, res) => {
  const order = findOrderByPayPalId(String(req.query.token ?? ''));
  if (!order) {
    res.redirect('/');
    return;
  }
  if (req.path === '/paypal/return') {
    await settleOrder(order).catch((err) => console.error('Capture failed for order', order.id, err));
  }
  res.redirect(`/orders/${order.id}`);
});

app.use('/api', () => {
  throw new HttpError(404, 'Not found.');
});

app.use('/api', ((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof Anthropic.AuthenticationError) {
    res.status(500).json({ error: 'The Claude API key is missing or invalid. Set ANTHROPIC_API_KEY in .env.' });
  } else if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    res.status(503).json({ error: 'Claude is busy right now. Try again in a moment.' });
  } else {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Something went wrong.' });
  }
}) satisfies ErrorRequestHandler);

if (config.isProduction) {
  const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/web');
  app.use(express.static(webDir));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
} else {
  // In development Vite runs inside this server, so the app, API and PayPal redirects share one port.
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

seedSampleShop();

app.listen(config.port, () => {
  console.log(`Chalkboard running at ${config.publicUrl}`);
});

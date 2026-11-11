// Recreates the sample shop at startup, so a hosted demo always has a shop to try
// even after the host resets its disk (Render's free plan does on every restart).
import { readFileSync } from 'node:fs';
import type { NewShop } from '../shared/types.ts';
import { getShop, saveShop } from './store.ts';

export const SAMPLE_SLUG = 'rosas-bakery';

export function seedSampleShop() {
  const paypalEmail = process.env.SAMPLE_SHOP_PAYPAL_EMAIL;
  if (!paypalEmail || getShop(SAMPLE_SLUG)) return;

  const sample: Omit<NewShop, 'paypalEmail'> = JSON.parse(
    readFileSync(new URL('./sample/rosas-bakery.json', import.meta.url), 'utf8'),
  );
  saveShop({
    ...sample,
    paypalEmail,
    slug: SAMPLE_SLUG,
    createdAt: new Date().toISOString(),
    // The sample dashboard is meant to be shared with judges, so its key can be public.
    ownerKey: process.env.SAMPLE_SHOP_OWNER_KEY || 'demo',
  });
  console.log(`Sample shop ready at /s/${SAMPLE_SLUG}`);
}

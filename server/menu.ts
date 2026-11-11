// Reads a photo of a menu board into a structured catalog with Claude.
import { randomUUID } from 'node:crypto';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { MenuDraft } from '../shared/types.ts';
import { claude, MODEL } from './claude.ts';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const MenuSchema = z.object({
  shop_name: z.string().describe('Shop name if it appears on the board, otherwise empty'),
  currency: z.string().describe('ISO 4217 code implied by the price symbols; USD if unclear'),
  hours: z.string().describe('Opening hours as written, otherwise empty'),
  location: z.string().describe('Address or location as written, otherwise empty'),
  notes: z
    .array(z.string())
    .describe('Other facts a customer would ask about: abbreviation legend, specials, pickup or payment notes'),
  items: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      category: z.string(),
      price: z.number().describe('Price in major units, e.g. 4.5 for $4.50; 0 if no price is readable'),
      tags: z.array(z.string()),
      unsure: z.array(z.enum(['name', 'description', 'category', 'price'])),
      note: z.string(),
    }),
  ),
});

const SYSTEM_PROMPT = `You read photos of menus and price boards from small food shops (chalkboards, whiteboards, paper menus, social media posts) and turn them into a catalog the shop can sell from online. Customers and AI shopping assistants will order from this catalog, so accuracy matters more than completeness.

- One item per sellable variant. When an item has sizes or options with different prices ("Latte 12oz $4.25 / 16oz $4.95"), output one item per variant with the variant in the name ("Latte (12 oz)").
- Add-ons that only modify another item ("oat milk +$0.75") are not items; put them in notes.
- Use the board's own section headings as categories. Without headings, use short plain categories such as Coffee or Pastries.
- Copy names as written, fixing only obvious spelling slips. Never invent items, descriptions or prices. A description holds only what the board says about the item (fillings, ingredients), otherwise it is empty.
- Tags are dietary or attribute markers the board shows, written out in plain words using the board's legend ("V" becomes "vegan" when the legend says so).
- When any field of an item is hard to read or a guess (smudged chalk, glare, cut off, ambiguous digits), list that field in unsure and explain in note in a few words, e.g. "price smudged: 4.50 or 4.80". When you are confident, unsure is empty and note is "".
- An item with no readable price gets price 0 and price in unsure.
- Ignore drawings, decorations and text that isn't meant for customers.`;

export async function readMenu(imageBase64: string, mediaType: ImageType): Promise<MenuDraft> {
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // If the request is declined by a safety classifier, the API retries it on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: { effort: 'medium', format: betaZodOutputFormat(MenuSchema) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Read this menu into the catalog.' },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error("Claude couldn't read this image. Try a different photo.");
  }
  const menu = response.parsed_output;
  if (!menu) throw new Error('Claude returned a menu that could not be parsed. Try again.');

  return {
    shopName: menu.shop_name,
    currency: menu.currency || 'USD',
    info: { hours: menu.hours, location: menu.location, notes: menu.notes },
    items: menu.items.map((item) => ({ ...item, id: randomUUID(), available: true })),
  };
}

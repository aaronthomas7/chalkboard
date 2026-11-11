// The shop's ordering assistant: answers menu questions and creates PayPal checkouts with Claude.
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatReply, Order, Shop } from '../shared/types.ts';
import { claude, MODEL } from './claude.ts';
import { CheckoutError, createCheckout, settleOrder, type CheckoutRequest } from './orders.ts';
import { getOrder } from './store.ts';

type Session = {
  shopSlug: string;
  // Fixed for the whole conversation: the history is only ever appended to.
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  orderIds: string[];
  lastUsed: number;
};

const sessions = new Map<string, Session>();
const MAX_SESSIONS = 500;
const MAX_MESSAGES = 80;
const MAX_STEPS = 5;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'create_checkout',
    description:
      'Create a PayPal checkout for the customer\'s pickup order. The shop computes prices and the total from its menu, and the customer pays on PayPal using the button shown under your reply. Returns the order number, lines and total, or an error such as a sold-out item.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string', description: 'The id in square brackets from the menu' },
              quantity: { type: 'integer' },
            },
            required: ['item_id', 'quantity'],
            additionalProperties: false,
          },
        },
        pickup_time: {
          type: 'string',
          description: 'When the customer will pick up, as they said it. "as soon as possible" if they did not say.',
        },
        customer_name: { type: 'string', description: 'Name for the order, or "" if not given' },
        note: { type: 'string', description: 'Special requests for the shop, or ""' },
      },
      required: ['items', 'pickup_time', 'customer_name', 'note'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_order',
    description: 'Check whether an order created in this chat has been paid.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { order_number: { type: 'string' } },
      required: ['order_number'],
      additionalProperties: false,
    },
  },
];

function systemPrompt(shop: Shop): string {
  const money = (value: number) => `${value.toFixed(2)} ${shop.currency}`;
  const menu = shop.items
    .map((item) =>
      [
        `- [${item.id}] ${item.name}`,
        item.category,
        money(item.price),
        item.tags.length ? `tags: ${item.tags.join(', ')}` : '',
        item.description,
        item.available ? '' : 'SOLD OUT',
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n');
  const info = [
    shop.info.hours && `Hours: ${shop.info.hours}`,
    shop.info.location && `Location: ${shop.info.location}`,
    ...shop.info.notes.filter((note) => note.trim()),
  ]
    .filter(Boolean)
    .join('\n');

  return `You are the ordering assistant for ${shop.name}, a small food shop. You chat with customers, or with AI assistants shopping for them, on the shop's page: you answer questions about the menu and take orders for pickup. Customers pay through PayPal; you never see or ask for payment details.

<shop_info>
${info || 'No other details.'}
</shop_info>

<menu>
${menu}
</menu>

- Answer only from the menu and shop info. If you don't know something (allergens beyond the tags, ingredients not listed), say so and suggest asking the shop at pickup.
- When the customer has said what they want, call create_checkout. Ask a short question first only when something is missing or ambiguous, such as which size or how many.
- Sold-out items can't be ordered. Offer the closest available alternative.
- After create_checkout succeeds, confirm the items and the total from its result in one or two sentences and tell them to pay with the PayPal button below. Don't write out a link.
- If a tool returns an error, explain it plainly and offer a fix.
- Keep replies short and warm: one to three sentences, plain text, no markdown. Don't add caveats or suggestions the customer didn't ask for.`;
}

function getSession(shop: Shop, conversationId: string): Session {
  let session = sessions.get(conversationId);
  if (!session || session.shopSlug !== shop.slug) {
    session = { shopSlug: shop.slug, system: systemPrompt(shop), messages: [], orderIds: [], lastUsed: Date.now() };
    sessions.set(conversationId, session);
    if (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions].sort(([, a], [, b]) => a.lastUsed - b.lastUsed)[0];
      sessions.delete(oldest[0]);
    }
  }
  session.lastUsed = Date.now();
  return session;
}

async function runTool(
  block: Anthropic.Beta.BetaToolUseBlock,
  session: Session,
  created: Order[],
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const result = (content: unknown, isError = false): Anthropic.Beta.BetaToolResultBlockParam => ({
    type: 'tool_result',
    tool_use_id: block.id,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    is_error: isError,
  });

  try {
    if (block.name === 'create_checkout') {
      const order = await createCheckout(session.shopSlug, block.input as CheckoutRequest);
      session.orderIds.push(order.id);
      created.push(order);
      return result({
        order_number: order.number,
        lines: order.lines.map((line) => `${line.quantity} x ${line.name} @ ${line.unitPrice.toFixed(2)}`),
        total: `${order.total.toFixed(2)} ${order.currency}`,
        pickup_time: order.pickupTime,
        status: 'Waiting for payment. The customer pays with the PayPal button shown under your reply.',
      });
    }
    if (block.name === 'check_order') {
      const { order_number } = block.input as { order_number: string };
      const order = session.orderIds
        .map((id) => getOrder(id))
        .find((candidate) => candidate?.number === order_number.trim().toUpperCase());
      if (!order) return result(`No order ${order_number} was created in this chat.`, true);
      const settled = await settleOrder(order);
      return result({ order_number: settled.number, status: settled.status === 'paid' ? 'paid' : 'not paid yet' });
    }
    return result(`Unknown tool ${block.name}.`, true);
  } catch (err) {
    if (err instanceof CheckoutError) return result(err.message, true);
    throw err;
  }
}

export async function chat(shop: Shop, conversationId: string, text: string): Promise<ChatReply> {
  const session = getSession(shop, conversationId);
  if (session.messages.length >= MAX_MESSAGES) {
    return { reply: 'This chat has gotten long. Refresh the page to start a new one.', orders: [] };
  }

  const start = session.messages.length;
  const created: Order[] = [];
  session.messages.push({ role: 'user', content: text });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await claude().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // If a safety classifier declines the request, the API retries it on a fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Chat should feel quick; menu questions and orders don't need deep reasoning.
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: session.system, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages: session.messages,
      });
      session.messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'refusal') {
        return { reply: "Sorry, I can't help with that. I can answer questions about the menu or take an order.", orders: created };
      }
      if (response.stop_reason !== 'tool_use') {
        const reply = response.content
          .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        return { reply: reply || 'Is there anything else I can get you?', orders: created };
      }

      const toolUses = response.content.filter(
        (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
      );
      const results = await Promise.all(toolUses.map((block) => runTool(block, session, created)));
      session.messages.push({ role: 'user', content: results });
    }
    return { reply: 'Sorry, I lost my train of thought. Could you say that again?', orders: created };
  } catch (err) {
    // Drop this turn so the conversation stays valid for the next message.
    session.messages.length = start;
    throw err;
  }
}

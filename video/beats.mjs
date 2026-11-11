// Narration for each step of the demo. `speech` is read by text-to-speech; `caption` is the subtitle.
export const BEATS = [
  {
    id: 'hook',
    caption:
      "Ask an AI assistant to order from your local bakery, and it can't. The bakery has a chalkboard, not an online catalog. PayPal is making merchants agent-ready, but that starts from a store that already has a catalog. Chalkboard is the on-ramp for everyone else.",
  },
  {
    id: 'who',
    caption:
      "Bakeries, food trucks, market stalls. One photo, two minutes, and they're selling through AI, with every payment going to their own PayPal.",
  },
  {
    id: 'read',
    caption:
      'Claude Opus 5.5 reads the board: items, prices, categories and dietary tags. Every latte size becomes its own item, and V and GF become vegan and gluten free.',
    speech:
      'Claude Opus 5.5 reads the board: items, prices, categories and dietary tags. Every latte size becomes its own item, and V and G F become vegan and gluten free.',
  },
  {
    id: 'smudge',
    caption:
      "When the chalk is smudged, it doesn't guess silently. It flags the cell and says why, and the owner confirms it with one click.",
  },
  {
    id: 'publish',
    caption:
      'The owner adds the PayPal account that should get paid and publishes. The money goes straight to the shop, never through us.',
  },
  {
    id: 'soldout',
    caption: "Sold out of sourdough today? Untick it, and the shop's AI assistant knows right away.",
  },
  {
    id: 'ask',
    caption: 'Customers, or their AI assistants, just ask. Answers come only from this menu.',
  },
  {
    id: 'sourdough',
    caption: "It knows what's sold out, and offers an alternative.",
  },
  {
    id: 'order',
    caption:
      "When the order is clear, it builds the checkout. The AI picks the items, but prices and the total are recalculated on our server from the shop's menu, so a chat can't change what anyone pays.",
  },
  {
    id: 'pay',
    caption:
      "The customer approves on PayPal's own page. We capture the payment with the PayPal Orders API, using the payee field, so it lands directly in the shop's account.",
  },
  {
    id: 'dashboard',
    caption:
      'The owner sees the order live: what was ordered, the pickup time, and exactly what lands in their PayPal after fees.',
  },
  {
    id: 'close',
    caption:
      'Claude for vision and tool use, PayPal for direct-to-merchant payments, and AG Grid for review and orders. Next: an MCP endpoint for every shop, so assistants like Claude can shop them directly. Chalkboard: every small shop, agent-ready.',
    speech:
      'Claude for vision and tool use, PayPal for direct-to-merchant payments, and A G Grid for review and orders. Next: an M C P endpoint for every shop, so assistants like Claude can shop them directly. Chalkboard: every small shop, agent-ready.',
  },
];

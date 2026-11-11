// Narration for each step of the demo, in order. `caption` is the line to read (and the subtitle);
// `speech` overrides it for the text-to-speech fallback where letters need spelling out.
export const BEATS = [
  {
    id: 'hook',
    caption:
      "This is Rosa's bakery, and her whole menu lives on a chalkboard. PayPal is getting merchants ready for AI shoppers, but that starts with an online catalog, and Rosa doesn't have one. Chalkboard gives her one.",
  },
  {
    id: 'who',
    caption: 'All Rosa needs is a photo of her board. No website, no spreadsheet, no developer.',
  },
  {
    id: 'read',
    caption:
      'Claude reads the board in seconds: every item and price, each latte size as its own product, and the little V and GF turned into vegan and gluten-free.',
    speech:
      'Claude reads the board in seconds: every item and price, each latte size as its own product, and the little V and G F turned into vegan and gluten-free.',
  },
  {
    id: 'smudge',
    caption: "One price is smudged. Claude doesn't guess. It flags it and says why, and Rosa confirms it with a click.",
  },
  {
    id: 'publish',
    caption: 'She adds her PayPal email and publishes. The money goes straight to her.',
  },
  {
    id: 'soldout',
    caption: "Out of sourdough today? One click and it's off the menu.",
  },
  {
    id: 'ask',
    caption: "Now a customer, or their AI assistant, just asks. Answers come from Rosa's menu.",
  },
  {
    id: 'sourdough',
    caption: "Sourdough's sold out, so it suggests the rye.",
  },
  {
    id: 'order',
    caption:
      "They order in plain words, and the assistant builds the checkout. Prices always come from Rosa's menu on our server, never from the chat.",
  },
  {
    id: 'pay',
    caption: "They pay on PayPal's own page. One tap, and the PayPal Orders API sends the money directly to Rosa's account.",
  },
  {
    id: 'dashboard',
    caption: 'Rosa sees the order right away, with exactly what she receives after fees.',
  },
  {
    id: 'close',
    caption:
      "Chalkboard uses Claude to read menus and take orders, PayPal to pay each shop directly, and AG Grid for the owner's tools. Next, every shop gets its own MCP endpoint, so any AI assistant can shop there. Chalkboard: every small shop, agent-ready.",
    speech:
      "Chalkboard uses Claude to read menus and take orders, PayPal to pay each shop directly, and A G Grid for the owner's tools. Next, every shop gets its own M C P endpoint, so any AI assistant can shop there. Chalkboard: every small shop, agent-ready.",
  },
];

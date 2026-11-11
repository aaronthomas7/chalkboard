// Types shared by the server and the web app.

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  tags: string[];
  available: boolean;
  // Fields the AI couldn't read confidently, and why. Cleared as the owner confirms them.
  unsure: string[];
  note: string;
};

export type ShopInfo = {
  hours: string;
  location: string;
  notes: string[];
};

export type MenuDraft = {
  shopName: string;
  currency: string;
  info: ShopInfo;
  items: MenuItem[];
};

export type NewShop = {
  name: string;
  paypalEmail: string;
  currency: string;
  info: ShopInfo;
  items: MenuItem[];
};

export type Shop = NewShop & {
  slug: string;
  createdAt: string;
};

export type PublishedShop = {
  shop: Shop;
  // Secret for the owner dashboard. Only returned once, when the shop is published.
  ownerKey: string;
};

export type OrderLine = {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: string;
  // Short code the customer and the shop say out loud at pickup.
  number: string;
  shopSlug: string;
  shopName: string;
  currency: string;
  lines: OrderLine[];
  total: number;
  customerName: string;
  pickupTime: string;
  note: string;
  status: 'awaiting_payment' | 'paid';
  paypalOrderId: string;
  approvalUrl: string;
  createdAt: string;
  paidAt?: string;
  captureId?: string;
  // What lands in the shop's PayPal after fees.
  shopReceives?: string;
};

export type ChatReply = {
  reply: string;
  orders: Order[];
};

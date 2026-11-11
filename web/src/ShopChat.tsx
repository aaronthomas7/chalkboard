import { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, Shop } from '../../shared/types.ts';
import { sendChat } from './api.ts';
import { CheckoutCard } from './CheckoutCard.tsx';

type Message = {
  role: 'user' | 'assistant';
  text: string;
  orders?: Order[];
  error?: boolean;
};

function suggestionsFor(shop: Shop): string[] {
  const available = shop.items.filter((item) => item.available);
  const tag = available.flatMap((item) => item.tags)[0];
  const first = available[0];
  return [
    tag ? `What do you have that's ${tag}?` : "What's popular here?",
    first ? `2 ${first.name} for pickup at 9am, please` : '',
    shop.info.hours ? 'When are you open?' : '',
  ].filter(Boolean);
}

export function ShopChat({ shop }: { shop: Shop }) {
  const [conversationId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: `Hi! Ask me anything about ${shop.name}'s menu, or tell me what you'd like for pickup.` },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => suggestionsFor(shop), [shop]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setInput('');
    setSending(true);
    try {
      const { reply, orders } = await sendChat(shop.slug, conversationId, message);
      setMessages((current) => [...current, { role: 'assistant', text: reply, orders }]);
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Something went wrong.';
      setMessages((current) => [...current, { role: 'assistant', text, error: true }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat" aria-label={`Order from ${shop.name}`}>
      <header className="chat-header">
        <h2>Ask &amp; order</h2>
        <p>Answers come from this menu. You pay {shop.name} directly with PayPal.</p>
      </header>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.map((message, index) => (
          <div key={index} className={`bubble bubble-${message.role}${message.error ? ' bubble-error' : ''}`}>
            {message.text}
            {message.orders?.map((order) => <CheckoutCard key={order.id} initial={order} payInPopup />)}
          </div>
        ))}
        {sending && (
          <div className="bubble bubble-assistant typing" aria-label="Assistant is typing">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      {messages.length === 1 && (
        <div className="chat-suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => send(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the menu or place an order"
          aria-label="Message"
          maxLength={1000}
        />
        <button type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

import { useEffect, useState } from 'react';
import type { Order } from '../../shared/types.ts';
import { getOrder } from './api.ts';
import { CheckoutCard } from './CheckoutCard.tsx';

// Where PayPal sends the buyer back to. Opened as a popup from the chat, it closes itself once paid.
export function OrderPage({ id }: { id: string }) {
  const [order, setOrder] = useState<Order>();
  const [error, setError] = useState<string>();
  const inPopup = Boolean(window.opener);

  useEffect(() => {
    getOrder(id).then(setOrder, (e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (inPopup && order?.status === 'paid') {
      const timer = setTimeout(() => window.close(), 2500);
      return () => clearTimeout(timer);
    }
  }, [inPopup, order?.status]);

  return (
    <>
      <header className="topbar">
        <a href="/" className="logo">
          Chalkboard
        </a>
      </header>
      <main className="receipt">
        {error && <p className="error">{error}</p>}
        {!order && !error && <p className="muted">Loading your order…</p>}
        {order && (
          <>
            <h1>{order.status === 'paid' ? 'Thanks for your order!' : 'Payment not finished'}</h1>
            <p className="muted">
              {order.status === 'paid'
                ? inPopup
                  ? 'Payment complete. This window will close by itself.'
                  : `${order.shopName} has your order.`
                : 'Your order is saved. Pay with PayPal to send it to the shop.'}
            </p>
            <CheckoutCard initial={order} />
            <a href={`/s/${order.shopSlug}`}>Back to {order.shopName}</a>
          </>
        )}
      </main>
    </>
  );
}

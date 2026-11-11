import { useEffect, useRef, useState } from 'react';
import type { MenuItem, Order, Shop } from '../../shared/types.ts';
import { formatPrice, getOrders, getShop, saveItems } from './api.ts';
import { MenuGrid } from './MenuGrid.tsx';
import { OrdersGrid } from './OrdersGrid.tsx';

const POLL_MS = 4000;

// The owner's private dashboard: incoming orders and the live menu.
export function ManagePage({ slug }: { slug: string }) {
  const params = new URLSearchParams(window.location.search);
  const ownerKey = params.get('key') ?? '';
  const justPublished = params.has('new');
  const shopLink = `${window.location.origin}/s/${slug}`;

  const [shop, setShop] = useState<Shop>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string>();
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    getShop(slug).then(setShop, (e: Error) => setError(e.message));
    const load = () => getOrders(slug, ownerKey).then(setOrders, (e: Error) => setError(e.message));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [slug, ownerKey]);

  // Menu edits save shortly after the owner stops typing.
  function updateItems(items: MenuItem[]) {
    if (!shop) return;
    setShop({ ...shop, items });
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveItems(slug, ownerKey, items).then(
        () => setSaveState('saved'),
        (e: Error) => {
          setSaveState('failed');
          setError(e.message);
        },
      );
    }, 600);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shopLink);
    setCopied(true);
  }

  const paid = orders.filter((order) => order.status === 'paid');
  const revenue = paid.reduce((sum, order) => sum + order.total, 0);

  return (
    <>
      <header className="topbar">
        <a href="/" className="logo">
          Chalkboard
        </a>
        <span className="topbar-note">Owner dashboard · keep this link private</span>
      </header>

      {justPublished && (
        <div className="banner">
          <strong>Your shop is live.</strong> Bookmark this page: it's your private dashboard.
        </div>
      )}

      <main className="manage">
        {error && <p className="error">{error}</p>}
        {shop && (
          <>
            <section className="manage-head">
              <div>
                <h1>{shop.name}</h1>
                <p className="muted">
                  Payments go to <strong>{shop.paypalEmail}</strong> through PayPal.
                </p>
              </div>
              <div className="share">
                <code>{shopLink}</code>
                <button type="button" className="link-button" onClick={copyLink}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <a className="secondary" href={`/s/${slug}`} target="_blank" rel="noreferrer">
                  Open shop
                </a>
              </div>
            </section>

            <section className="stats">
              <div>
                <span className="stat-value">{paid.length}</span>
                <span className="stat-label">Paid orders</span>
              </div>
              <div>
                <span className="stat-value">{formatPrice(revenue, shop.currency)}</span>
                <span className="stat-label">Sales</span>
              </div>
              <div>
                <span className="stat-value">{orders.length - paid.length}</span>
                <span className="stat-label">Awaiting payment</span>
              </div>
            </section>

            <section>
              <h2>Orders</h2>
              <div className="grid-wrap">
                <OrdersGrid orders={orders} />
              </div>
            </section>

            <section>
              <h2>
                Menu{' '}
                <span className="save-state">
                  {saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved' : 'All changes saved'}
                </span>
              </h2>
              <p className="muted">Untick "On sale" when something sells out. The shop's assistant sees changes right away.</p>
              <div className="grid-wrap">
                <MenuGrid items={shop.items} currency={shop.currency} onChange={updateItems} />
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

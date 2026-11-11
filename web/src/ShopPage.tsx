import { useEffect, useState } from 'react';
import type { MenuItem, Shop } from '../../shared/types.ts';
import { formatPrice, getShop } from './api.ts';
import { ShopChat } from './ShopChat.tsx';

function byCategory(items: MenuItem[]): [string, MenuItem[]][] {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const key = item.category || 'Menu';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups];
}

export function ShopPage({ slug }: { slug: string }) {
  const [shop, setShop] = useState<Shop>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    getShop(slug).then(setShop, (e: Error) => setError(e.message));
  }, [slug]);

  if (error) {
    return (
      <main className="intro">
        <p className="error">{error}</p>
        <a href="/">Create a shop</a>
      </main>
    );
  }
  if (!shop) return <main className="intro muted">Loading…</main>;

  const notes = shop.info.notes.filter((note) => note.trim());

  return (
    <>
      <header className="topbar">
        <a href="/" className="logo">
          Chalkboard
        </a>
        <span className="topbar-note">Payments go to this shop's PayPal</span>
      </header>

      <main className="shop">
        <section className="board">
          <h1>{shop.name}</h1>
          {(shop.info.hours || shop.info.location) && (
            <p className="board-meta">{[shop.info.hours, shop.info.location].filter(Boolean).join(' · ')}</p>
          )}

          {byCategory(shop.items).map(([category, items]) => (
            <div key={category} className="board-section">
              <h2>{category}</h2>
              <ul>
                {items.map((item) => (
                  <li key={item.id} className={item.available ? undefined : 'sold-out'}>
                    <div className="board-item">
                      <span className="board-name">{item.name}</span>
                      <span className="board-dots" aria-hidden />
                      <span className="board-price">
                        {item.available ? formatPrice(item.price, shop.currency) : 'Sold out'}
                      </span>
                    </div>
                    {(item.description || item.tags.length > 0) && (
                      <div className="board-detail">
                        {item.description}
                        {item.tags.map((tag) => (
                          <span key={tag} className="chip chip-chalk">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {notes.length > 0 && (
            <ul className="board-notes">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </section>

        <ShopChat shop={shop} />
      </main>
    </>
  );
}

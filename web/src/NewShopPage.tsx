import { useState, type DragEvent } from 'react';
import type { MenuDraft, MenuItem } from '../../shared/types.ts';
import { publishShop, readMenu } from './api.ts';
import { MenuGrid } from './MenuGrid.tsx';
import { photoToDataUrl } from './photo.ts';

const SAMPLE_MENU = '/samples/rosas-bakery.jpg';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

function blankItem(category: string): MenuItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    category,
    price: 0,
    tags: [],
    available: true,
    unsure: [],
    note: '',
  };
}

export function NewShopPage() {
  const [photo, setPhoto] = useState<string>();
  const [draft, setDraft] = useState<MenuDraft>();
  const [reading, setReading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  async function read(source: Blob) {
    setError(undefined);
    setDraft(undefined);
    setReading(true);
    try {
      const dataUrl = await photoToDataUrl(source);
      setPhoto(dataUrl);
      const menu = await readMenu(dataUrl);
      setDraft(menu);
      setName(menu.shopName);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setReading(false);
    }
  }

  async function readSample() {
    const res = await fetch(SAMPLE_MENU);
    await read(await res.blob());
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) void read(file);
  }

  async function publish() {
    if (!draft) return;
    setError(undefined);
    setPublishing(true);
    try {
      const { shop, ownerKey } = await publishShop({
        name,
        paypalEmail: email,
        currency: draft.currency,
        info: draft.info,
        items: draft.items,
      });
      window.location.assign(`/s/${shop.slug}/manage?key=${encodeURIComponent(ownerKey)}&new=1`);
    } catch (e) {
      setError(errorMessage(e));
      setPublishing(false);
    }
  }

  const setItems = (items: MenuItem[]) => draft && setDraft({ ...draft, items });
  const setInfo = (info: Partial<MenuDraft['info']>) => draft && setDraft({ ...draft, info: { ...draft.info, ...info } });
  const flaggedCount = draft?.items.filter((item) => item.unsure.length > 0).length ?? 0;

  return (
    <>
      <header className="topbar">
        <a href="/" className="logo">
          Chalkboard
        </a>
        <span className="topbar-note">Sandbox demo · payments in PayPal sandbox</span>
      </header>

      {!draft && (
        <main className="intro">
          <section className="hero">
            <h1>Snap your menu. Sell to AI shoppers.</h1>
            <p>
              Chalkboard reads your menu board, turns it into an online shop, and lets AI assistants order
              from you. Every payment goes straight to your PayPal.
            </p>
          </section>

          <section
            className={`dropzone${reading ? ' is-reading' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            {photo && reading ? (
              <div className="reading">
                <img src={photo} alt="Your menu" />
                <div className="reading-status">
                  <span className="spinner" aria-hidden />
                  Reading your menu: items, prices, categories…
                </div>
              </div>
            ) : (
              <>
                <label className="upload-button">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
                  />
                  Take or upload a photo of your menu
                </label>
                <p className="hint">A chalkboard, a printed menu, or a screenshot of your Instagram post.</p>
                <button type="button" className="link-button" onClick={readSample}>
                  No photo handy? Try a sample menu
                </button>
              </>
            )}
          </section>

          {error && <p className="error">{error}</p>}
        </main>
      )}

      {draft && (
        <main className="review">
          <aside className="review-photo">
            <img src={photo} alt="Your menu" />
            <button type="button" className="link-button" onClick={() => setDraft(undefined)}>
              Use a different photo
            </button>
          </aside>

          <section className="review-main">
            <h2>Check your menu</h2>
            <p className="muted">
              Claude found {draft.items.length} items. Click any cell to fix it.
              {flaggedCount > 0 && (
                <>
                  {' '}
                  <span className="chip chip-unsure">
                    {flaggedCount} {flaggedCount === 1 ? 'needs' : 'need'} a look
                  </span>{' '}
                  Hover a highlighted cell to
                  see why.
                </>
              )}
            </p>

            <div className="grid-wrap">
              <MenuGrid items={draft.items} currency={draft.currency} onChange={setItems} />
            </div>
            <button
              type="button"
              className="link-button"
              onClick={() => setItems([...draft.items, blankItem(draft.items.at(-1)?.category ?? '')])}
            >
              + Add an item
            </button>

            <div className="shop-form">
              <label>
                Shop name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rosa's Bakery" />
              </label>
              <label>
                PayPal email for payments
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.example.com"
                />
                <small>Use a PayPal sandbox Business account while testing.</small>
              </label>
              <label>
                Hours
                <input value={draft.info.hours} onChange={(e) => setInfo({ hours: e.target.value })} />
              </label>
              <label>
                Location
                <input value={draft.info.location} onChange={(e) => setInfo({ location: e.target.value })} />
              </label>
              <label className="span-2">
                Notes for customers, one per line
                <textarea
                  rows={3}
                  value={draft.info.notes.join('\n')}
                  onChange={(e) => setInfo({ notes: e.target.value.split('\n') })}
                />
              </label>
            </div>

            {error && <p className="error">{error}</p>}
            <button type="button" className="primary" disabled={publishing} onClick={publish}>
              {publishing ? 'Publishing…' : 'Publish my shop'}
            </button>
          </section>
        </main>
      )}
    </>
  );
}

import { ManagePage } from './ManagePage.tsx';
import { NewShopPage } from './NewShopPage.tsx';
import { OrderPage } from './OrderPage.tsx';
import { ShopPage } from './ShopPage.tsx';

export function App() {
  const path = window.location.pathname;
  const param = (pattern: RegExp) => {
    const match = pattern.exec(path)?.[1];
    return match && decodeURIComponent(match);
  };

  const manageSlug = param(/^\/s\/([^/]+)\/manage\/?$/);
  if (manageSlug) return <ManagePage slug={manageSlug} />;
  const shopSlug = param(/^\/s\/([^/]+)\/?$/);
  if (shopSlug) return <ShopPage slug={shopSlug} />;
  const orderId = param(/^\/orders\/([^/]+)\/?$/);
  if (orderId) return <OrderPage id={orderId} />;
  return <NewShopPage />;
}

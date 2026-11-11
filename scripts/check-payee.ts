// Checks that a sandbox payment created with Chalkboard's PayPal app lands in a *different*
// merchant's account (the shop), using the Orders v2 `payee` field.
//
//   npm run check:payee
//
// It creates a $4.50 order paid to SHOP_PAYPAL_EMAIL, prints a link for you to approve as a
// sandbox buyer, captures the payment when PayPal redirects back, and reports where the money went.
import { createServer } from 'node:http';
import { config } from '../server/config.ts';
import { approvalUrl, captureOrder, createOrder, PayPalError, type Order, type Payee } from '../server/paypal.ts';

const WAIT_FOR_BUYER_MS = 25 * 60_000;
const base = `http://localhost:${config.port}`;

const HINTS: Record<string, string> = {
  invalid_client: 'PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are wrong. Copy them from the Sandbox tab of Apps & Credentials.',
  PAYEE_ACCOUNT_INVALID: 'SHOP_PAYPAL_EMAIL is not a sandbox account. Copy the email from Testing Tools → Sandbox Accounts.',
  PAYEE_ACCOUNT_RESTRICTED: 'The shop sandbox account is restricted. Create a fresh sandbox Business account and use its email.',
  PAYEE_ACCOUNT_LOCKED_OR_CLOSED: 'The shop sandbox account is locked or closed. Create a fresh sandbox Business account.',
  PAYER_CANNOT_PAY: 'The buyer account cannot pay. Approve with a sandbox Personal account that has a balance or card.',
};

const describe = (payee?: Payee) =>
  payee ? `${payee.email_address ?? '(no email returned)'} [merchant ${payee.merchant_id ?? '?'}]` : '(not returned)';

const sameEmail = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

// Serves PayPal's return and cancel redirects for one order, then shuts down.
function waitForBuyer(orderId: string): Promise<'approved' | 'cancelled'> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', base);
      if (url.searchParams.get('token') !== orderId) {
        res.writeHead(404).end();
        return;
      }
      const outcome = url.pathname === '/paypal/return' ? 'approved' : 'cancelled';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
      res.end(
        outcome === 'approved'
          ? '<h2>Payment approved.</h2><p>Chalkboard is capturing it now. The result is in the terminal.</p>'
          : '<h2>Payment cancelled.</h2><p>Run <code>npm run check:payee</code> again to retry.</p>',
      );
      clearTimeout(timer);
      server.close();
      resolve(outcome);
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`Timed out after ${WAIT_FOR_BUYER_MS / 60_000} minutes waiting for the buyer to approve.`));
    }, WAIT_FOR_BUYER_MS);
    server.on('error', reject);
    server.listen(config.port);
  });
}

function report(order: Order, platform: Payee | undefined, shopEmail: string): boolean {
  const unit = order.purchase_units[0];
  const capture = unit?.payments?.captures?.[0];
  const payee = unit?.payee;
  const breakdown = capture?.seller_receivable_breakdown;

  console.log(`\nOrder ${order.id}: ${order.status}`);
  console.log(`Capture ${capture?.id ?? '?'}: ${capture?.status ?? '?'}${capture?.status_details?.reason ? ` (${capture.status_details.reason})` : ''}`);
  console.log(`Paid to:   ${describe(payee)}`);
  console.log(`App owner: ${describe(platform)}`);
  if (breakdown) {
    const fmt = (m?: { value: string; currency_code: string }) => (m ? `${m.value} ${m.currency_code}` : '?');
    console.log(`Shop receives ${fmt(breakdown.net_amount)} (gross ${fmt(breakdown.gross_amount)}, PayPal fee ${fmt(breakdown.paypal_fee)})`);
  }

  const toShop = sameEmail(payee?.email_address, shopEmail);
  const notPlatform = !platform?.merchant_id || payee?.merchant_id !== platform.merchant_id;

  // UNILATERAL means PayPal holds the money for an email that has no PayPal account.
  if (capture?.status_details?.reason === 'UNILATERAL') {
    console.log(`\n✗ FAIL: ${shopEmail} is not a PayPal sandbox account. Copy the email of a sandbox Business account from Testing Tools → Sandbox Accounts.`);
    return false;
  }
  if (capture?.status === 'COMPLETED' && toShop && notPlatform) {
    console.log('\n✓ PASS: the payment was captured into the shop’s account, not the app owner’s.');
    return true;
  }
  if (capture?.status === 'PENDING' && toShop && notPlatform) {
    console.log('\n~ ROUTED, BUT PENDING: the money went to the shop, but PayPal is holding it.');
    console.log('  In sandbox this usually means the shop account must accept the payment by hand');
    console.log('  (log in to it at sandbox.paypal.com). Routing to another account works.');
    return true;
  }
  console.log('\n✗ FAIL: the capture did not complete into the shop’s account.');
  return false;
}

async function main() {
  const shopEmail = process.env.SHOP_PAYPAL_EMAIL?.trim();
  if (!shopEmail) {
    fail('Set SHOP_PAYPAL_EMAIL in .env to a second sandbox Business account (not the one that owns your app).');
  }
  const redirects = { returnUrl: `${base}/paypal/return`, cancelUrl: `${base}/paypal/cancel` };

  console.log('1/3 Finding which sandbox account owns this PayPal app…');
  const control = await createOrder({
    description: 'Chalkboard payee check (control, never approved)',
    amount: { currency_code: 'USD', value: '1.00' },
    brandName: 'Chalkboard',
    ...redirects,
  });
  const platform = control.purchase_units[0]?.payee;
  console.log(`    App owner: ${describe(platform)}`);
  if (sameEmail(platform?.email_address, shopEmail)) {
    fail('SHOP_PAYPAL_EMAIL is the account that owns your app. Use a different sandbox Business account so the check proves money is routed elsewhere.');
  }

  console.log(`2/3 Creating a $4.50 order paid to the shop (${shopEmail})…`);
  const order = await createOrder({
    description: 'Almond croissant (Chalkboard payee check)',
    amount: { currency_code: 'USD', value: '4.50' },
    brandName: "Rosa's Bakery via Chalkboard",
    referenceId: 'payee-check',
    payeeEmail: shopEmail,
    ...redirects,
  });
  // PayPal only resolves the payee's merchant id at capture, so it shows as "?" here.
  console.log(`    Order ${order.id} created, payee: ${describe(order.purchase_units[0]?.payee)}`);
  const url = approvalUrl(order);
  if (!url) fail('PayPal did not return an approval link for the order.');

  console.log('3/3 Approve the payment as a sandbox buyer. Open this link in your browser:');
  console.log(`\n    ${url}\n`);
  console.log('    Log in with your sandbox *Personal* account and click Pay. Waiting…');
  if ((await waitForBuyer(order.id)) === 'cancelled') fail('The buyer cancelled the payment.');

  console.log('    Approved. Capturing…');
  const captured = await captureOrder(order.id);
  process.exitCode = report(captured, platform, shopEmail) ? 0 : 1;
}

main().catch((err: unknown) => {
  if (err instanceof PayPalError) {
    console.error(`\n✗ ${err.message}`);
    if (err.issues.length) console.error(`  Issues: ${err.issues.join(', ')}`);
    if (err.debugId) console.error(`  PayPal debug id: ${err.debugId}`);
    for (const key of [err.code, ...err.issues]) if (HINTS[key]) console.error(`  → ${HINTS[key]}`);
    process.exit(1);
  }
  fail(err instanceof Error ? err.message : String(err));
});

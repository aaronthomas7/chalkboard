// Builds out/chalkboard-for-judges.zip: a one-page quick-start PDF plus the demo video.
//
//   JUDGE_EMAIL=... JUDGE_PASSWORD=... VIDEO_URL=... npm run judges
//
// The judge's PayPal sandbox login is read from the environment so it never lands in the repo.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = new URL('./out/', import.meta.url).pathname;
const LIVE = 'https://chalkboard-oruo.onrender.com';
const SHOP_EMAIL = 'sb-k05vv53470847@business.example.com';
const { JUDGE_EMAIL, JUDGE_PASSWORD, VIDEO_URL } = process.env;

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const placeholder = '<i>added before submission</i>';
const link = (url, label = url.replace(/^https:\/\//, '')) => `<a href="${url}">${escape(label)}</a>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, system-ui, sans-serif; font-size: 9.6pt; line-height: 1.36; color: #1d2320; }
  header { background: #1f2b26; color: #f4f1e8; padding: 18px 44px 16px; }
  h1 { margin: 0; font-family: Caveat, cursive; font-size: 36pt; line-height: 1; }
  header p { margin: 4px 0 0; color: #c9c6bb; font-size: 10pt; }
  main { padding: 8px 44px 0; }
  h2 { margin: 12px 0 5px; font-size: 11.5pt; color: #2f5d50; }
  a { color: #2f5d50; font-weight: 600; text-decoration: none; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 2px 0; vertical-align: top; }
  td:first-child { width: 150px; color: #5f6b65; }
  .login { margin-top: 2px; padding: 8px 16px; border: 2px solid #e0a930; border-radius: 10px; background: #fff8e2; }
  .login td:first-child { width: 90px; }
  .login code { font-family: Inter, system-ui, sans-serif; font-size: 11.5pt; font-weight: 700; }
  .login i { font-weight: 400; color: #7a5200; }
  ol { margin: 0; padding-left: 20px; } li { margin: 0 0 4px; }
  q { font-style: italic; }
  ul { margin: 0; padding-left: 18px; } ul li { margin: 0 0 2px; }
  .two { display: flex; gap: 28px; } .two > div { flex: 1; }
  footer { margin: 12px 44px 0; padding-top: 8px; border-top: 1px solid #e3ddd0; font-size: 8.6pt; color: #5f6b65; }
</style></head><body>
<header>
  <h1>Chalkboard</h1>
  <p>Judge quick start · From a chalkboard menu to a shop AI assistants can buy from, paid straight to the shop with PayPal.</p>
</header>
<main>
  <h2>Links</h2>
  <table>
    <tr><td>Live app</td><td>${link(LIVE)}</td></tr>
    <tr><td>Sample shop</td><td>${link(`${LIVE}/s/rosas-bakery`)}</td></tr>
    <tr><td>Its owner dashboard</td><td>${link(`${LIVE}/s/rosas-bakery/manage?key=demo`)}</td></tr>
    <tr><td>Code (MIT)</td><td>${link('https://github.com/aaronthomas7/chalkboard')}</td></tr>
    <tr><td>Demo video</td><td>${VIDEO_URL ? link(VIDEO_URL) : 'on the Devpost page (a copy is in this zip)'}</td></tr>
  </table>

  <h2>PayPal sandbox buyer for judges (test money only)</h2>
  <div class="login"><table>
    <tr><td>Email</td><td><code>${JUDGE_EMAIL ? escape(JUDGE_EMAIL) : placeholder}</code></td></tr>
    <tr><td>Password</td><td><code>${JUDGE_PASSWORD ? escape(JUDGE_PASSWORD) : placeholder}</code></td></tr>
  </table></div>

  <h2>Try the whole flow in about 3 minutes</h2>
  <ol>
    <li>Open the <b>owner dashboard</b> link above. The first load can take up to a minute while the free host wakes up. In the Menu table, untick <b>On sale</b> for <i>Country sourdough loaf</i>.</li>
    <li>In another tab, open the <b>sample shop</b> and ask the assistant <q>What do you have that's vegan?</q>, then <q>Can I get a sourdough loaf?</q> It answers only from the menu, and offers an alternative to the sold-out loaf.</li>
    <li>Order: <q>A seeded rye, a morning bun and a 12 oz latte for pickup at 8:30, name Sam.</q> A checkout card appears with the total.</li>
    <li>Click <b>Pay with PayPal</b>, log in with the judge account above and click <b>Pay</b>. If your browser blocks the pop-up, PayPal opens in the same tab instead.</li>
    <li>The card switches to <b>Paid</b>. Back on the dashboard, the order shows as Paid with what the shop receives after PayPal fees.</li>
    <li><i>Optional:</i> on the home page click <b>Try a sample menu</b> (or upload any menu photo). Claude reads it in about 10 seconds and flags the smudged price. To publish, use the sandbox shop email <b>${SHOP_EMAIL}</b>.</li>
  </ol>

  <div class="two">
    <div>
      <h2>What to look for</h2>
      <ul>
        <li><b>Claude Opus 5.5</b> reads the menu photo (vision + structured outputs) and runs the shop's ordering assistant (tool use).</li>
        <li><b>PayPal Orders API</b>: the shop is the order's payee, so money goes straight to the merchant; captured after approval.</li>
        <li><b>AG Grid</b>: menu review with flagged cells, and the live orders table.</li>
        <li>The AI never sets prices: the server recomputes them from the menu.</li>
      </ul>
    </div>
    <div>
      <h2>Good to know</h2>
      <ul>
        <li>Everything runs in the PayPal <b>sandbox</b>; no real money moves.</li>
        <li>Using your own sandbox buyer? Create it with country <b>United States</b>; India-region sandbox accounts can't pay this shop.</li>
        <li>The demo resets when the free host restarts; the sample shop is recreated automatically.</li>
        <li>To run it locally, follow the README: <code>npm install</code>, fill in <code>.env</code>, <code>npm run dev</code>.</li>
      </ul>
    </div>
  </div>
</main>
<footer>Demo video narration uses an AI voice (Kokoro, open source); all on-screen footage is a real recording of the working app. Questions: see the Devpost project page.</footer>
</body></html>`;

const pdf = `${OUT}judge-quick-start.pdf`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const bytes = await page.pdf({ path: pdf, format: 'Letter', printBackground: true });
await browser.close();
const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`Wrote ${pdf} (${pages} page${pages === 1 ? '' : 's'})`);
if (pages !== 1) console.log('WARNING: the guide should fit on one page.');

if (JUDGE_EMAIL && JUDGE_PASSWORD) {
  const zip = `${OUT}chalkboard-for-judges.zip`;
  const video = `${OUT}chalkboard-demo.mp4`;
  if (!existsSync(video)) throw new Error('out/chalkboard-demo.mp4 is missing; run npm run assemble first.');
  execFileSync('rm', ['-f', zip]);
  execFileSync('zip', ['-j', '-q', zip, pdf, video]);
  console.log(`Wrote ${zip}`);
} else {
  console.log('Preview only: set JUDGE_EMAIL and JUDGE_PASSWORD to build the final zip.');
}

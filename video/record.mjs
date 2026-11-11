// Records the Chalkboard demo in a real browser and writes out/timeline.json for assemble.mjs.
//
//   npm run record
//
// A browser window opens twice for you: first to log in to the PayPal sandbox as the buyer
// (so checkout skips the login screen), and later to click Pay on PayPal's page.
// Everything else is automated. Waits for Claude and PayPal are logged so they can be cut.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BEATS } from './beats.mjs';

const BASE = process.env.DEMO_URL ?? 'http://localhost:4100';
const SHOP_EMAIL = process.env.SHOP_EMAIL ?? 'sb-k05vv53470847@business.example.com';
const OUT = new URL('./out/', import.meta.url).pathname;
const VIEW = { width: 1440, height: 900 };
const VOICE = process.env.VOICE ?? 'Samantha';
const MINUTES = 60_000;

const log = (message) => console.log(message);

// A visible cursor: headless recordings don't show the real one.
const CURSOR_SCRIPT = `(() => {
  const add = () => {
    if (document.getElementById('__demo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.style.cssText = 'position:fixed;left:-50px;top:-50px;width:26px;height:26px;margin:-2px 0 0 -2px;z-index:2147483647;pointer-events:none;transition:transform .1s;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.4 3.6 7.4-2.8 1.3-3.5-7.4L4 18.5z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(.8)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  };
  if (document.documentElement) add(); else addEventListener('DOMContentLoaded', add);
})();`;

const END_CARD = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at top,#2a3a33,#1f2b26 70%);color:#f4f1e8;font-family:Inter,system-ui,sans-serif}
  main{text-align:center} h1{font-family:Caveat,cursive;font-size:120px;margin:0}
  .tag{font-size:26px;color:#c9c6bb;margin:0 0 48px} .links{font-size:24px;line-height:1.9}
  .links b{color:#f6d77a;font-weight:600} .built{margin-top:40px;font-size:18px;color:#c9c6bb}
</style></head><body><main>
  <h1>Chalkboard</h1>
  <p class="tag">Every small shop, agent-ready.</p>
  <div class="links"><b>Live</b> chalkboard-oruo.onrender.com<br><b>Code</b> github.com/aaronthomas7/chalkboard</div>
  <p class="built">Built with Claude Opus 5.5 · PayPal Orders API (sandbox) · AG Grid</p>
</main></body></html>`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}audio`, { recursive: true });

// 1. Narration, so each step can be held for as long as its line takes to read.
const narration = {};
for (const beat of BEATS) {
  const file = `${OUT}audio/${beat.id}.aiff`;
  execFileSync('say', ['-v', VOICE, '-r', '180', '-o', file, beat.speech ?? beat.caption]);
  const info = execFileSync('afinfo', [file], { encoding: 'utf8' });
  narration[beat.id] = { file, duration: Number(/estimated duration: ([\d.]+)/.exec(info)[1]) };
}
const narrationTotal = Object.values(narration).reduce((sum, n) => sum + n.duration, 0);
log(`Narration ready: ${narrationTotal.toFixed(1)}s across ${BEATS.length} steps`);

const browser = await chromium.launch({ headless: false, args: [`--window-size=${VIEW.width},${VIEW.height + 140}`] });

// 2. The buyer logs in to the PayPal sandbox once, outside the recording. The session is kept
// (git-ignored) so a re-run doesn't ask again while it's still valid.
const SESSION = new URL('./.paypal-session.json', import.meta.url).pathname;
const loginContext = await browser.newContext({
  viewport: VIEW,
  storageState: existsSync(SESSION) ? SESSION : undefined,
});
const loginPage = await loginContext.newPage();
await loginPage.goto('https://www.sandbox.paypal.com/myaccount/summary');
const loggedIn = (url) =>
  url.hostname.endsWith('paypal.com') && !/signin|authflow|login|challenge|webapps/i.test(url.pathname);
if (!loggedIn(new URL(loginPage.url()))) {
  log('ACTION NEEDED: log in to the PayPal sandbox as your US buyer in the browser window that opened.');
  await loginPage.waitForURL(loggedIn, { timeout: 20 * MINUTES });
}
await loginPage.waitForTimeout(2000);
const storageState = await loginContext.storageState({ path: SESSION });
await loginContext.close();
log('PayPal login saved. Recording now; please leave the window alone until you are asked to click Pay.');

// 3. The recorded run.
const context = await browser.newContext({
  viewport: VIEW,
  storageState,
  recordVideo: { dir: `${OUT}raw`, size: VIEW },
});
await context.addInitScript(CURSOR_SCRIPT);
// Keep PayPal in the recorded tab instead of a popup; the app falls back to a full-page redirect.
await context.addInitScript(() => {
  window.open = () => null;
});
const page = await context.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;

const beats = [];
const cuts = [];
let current;
let mouse = { x: VIEW.width / 2, y: VIEW.height / 2 };

function beat(id) {
  current = { id, start: now(), cut: 0 };
  beats.push(current);
  log(`STEP ${beats.length}/${BEATS.length}: ${id}`);
}

function cut(from, to) {
  if (to - from < 0.5) return;
  cuts.push({ from, to });
  current.cut += to - from;
}

// Holds the current step until its narration has had time to play (cut time doesn't count).
async function holdForNarration() {
  const needed = narration[current.id].duration + 0.7;
  while (now() - current.start - current.cut < needed) await page.waitForTimeout(100);
}

// Runs a slow step but keeps only its first `keep` seconds and last `tail` seconds in the video.
async function waitAndCut(fn, { keep = 1.2, tail = 0.4 } = {}) {
  const start = now();
  await fn();
  cut(start + keep, now() - tail);
}

async function moveTo(locator, { dx = 0.5, dy = 0.5 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  mouse = { x: box.x + box.width * dx, y: box.y + box.height * dy };
  await page.mouse.move(mouse.x, mouse.y, { steps: 24 });
}

async function click(locator, options) {
  await moveTo(locator, options);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.mouse.up();
}

async function typeInto(locator, text) {
  await click(locator);
  await locator.pressSequentially(text, { delay: 38 });
}

async function goto(url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.mouse.move(mouse.x, mouse.y);
}

const assistantReplies = '.bubble-assistant:not(.typing)';

async function ask(text) {
  const before = await page.locator(assistantReplies).count();
  await typeInto(page.getByLabel('Message'), text);
  await page.keyboard.press('Enter');
  await waitAndCut(
    () =>
      page.waitForFunction(([selector, count]) => document.querySelectorAll(selector).length > count, [
        assistantReplies,
        before,
      ], { timeout: 2 * MINUTES }),
    { keep: 1.0, tail: 0.2 },
  );
  await page.locator(assistantReplies).last().scrollIntoViewIfNeeded();
}

try {
  beat('hook');
  await goto(`${BASE}/samples/rosas-bakery.jpg`);
  await holdForNarration();

  beat('who');
  await goto(BASE);
  await page.getByRole('heading', { name: /Snap your menu/ }).waitFor();
  await moveTo(page.getByText('Take or upload a photo of your menu'));
  await holdForNarration();

  beat('read');
  await click(page.getByRole('button', { name: /Try a sample menu/ }));
  await waitAndCut(() => page.getByRole('heading', { name: 'Check your menu' }).waitFor({ timeout: 3 * MINUTES }), {
    keep: 2.5,
  });
  await page.waitForTimeout(800);
  const latte = page.locator('.grid-wrap .ag-row').filter({ hasText: 'Latte (12 oz)' }).first();
  if (await latte.count()) await moveTo(latte, { dx: 0.15 });
  await holdForNarration();

  beat('smudge');
  const flagged = page.locator('.grid-wrap .cell-unsure').first();
  if (await flagged.count()) {
    await moveTo(flagged); // shows the tooltip with Claude's reason
    await page.waitForTimeout(3000);
    const column = await flagged.getAttribute('col-id');
    const row = await flagged.locator('xpath=ancestor::div[@role="row"]').first().innerText();
    await click(flagged);
    if (column === 'price' && row.includes('Morning bun')) {
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('4.80', { delay: 90 });
    }
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
  } else {
    log('Note: Claude flagged nothing this time; skipping the smudge close-up.');
  }
  await holdForNarration();

  beat('publish');
  await typeInto(page.getByPlaceholder('you@business.example.com'), SHOP_EMAIL);
  await page.waitForTimeout(400);
  await click(page.getByRole('button', { name: 'Publish my shop' }));
  await page.waitForURL(/\/manage\?/, { timeout: MINUTES });
  await page.getByText('Your shop is live').waitFor();
  const dashboardUrl = page.url().replace('&new=1', '');
  const slug = new URL(page.url()).pathname.split('/')[2];
  await page.mouse.move(mouse.x, mouse.y);
  await holdForNarration();

  beat('soldout');
  const sourdough = page
    .locator('.ag-row')
    .filter({ hasText: 'Country sourdough loaf' })
    .locator('[col-id="available"] .ag-checkbox-input-wrapper');
  await click(sourdough);
  await page.getByText('All changes saved').waitFor({ timeout: 30_000 });
  await holdForNarration();

  beat('ask');
  await goto(`${BASE}/s/${slug}`);
  await page.getByRole('heading', { name: 'Ask & order' }).waitFor();
  await ask("What do you have that's vegan?");
  await holdForNarration();

  beat('sourdough');
  await ask('Can I get a sourdough loaf?');
  await holdForNarration();

  beat('order');
  await ask('OK, a seeded rye, a morning bun and a 12 oz latte for pickup at 8:30, name Sam.');
  if ((await page.locator('.checkout').count()) === 0) await ask("Yes, that's everything.");
  await moveTo(page.locator('.checkout').last());
  await holdForNarration();

  beat('pay');
  await click(page.locator('.checkout').last().getByRole('button', { name: /Pay with/ }));
  await page.waitForURL(/paypal\.com/, { timeout: MINUTES });
  const paypalShown = now();
  log('ACTION NEEDED: click Pay (or Complete Purchase) on the PayPal page in the browser window.');
  await page.waitForURL(/\/orders\//, { timeout: 20 * MINUTES });
  // Keep PayPal appearing and its last moments (review and Pay); drop any login in between.
  cut(paypalShown + 3, now() - 6);
  await page.getByText('Thanks for your order!').waitFor({ timeout: MINUTES });
  await page.waitForTimeout(500);
  await moveTo(page.locator('.checkout-done'));
  log('Payment done. Finishing the recording; no more actions needed.');
  await holdForNarration();

  beat('dashboard');
  await goto(dashboardUrl);
  await page.locator('.status-paid').first().waitFor({ timeout: MINUTES });
  await moveTo(page.locator('.ag-row').filter({ hasText: 'Sam' }).first(), { dx: 0.8 });
  await holdForNarration();

  beat('close');
  await page.setContent(END_CARD, { waitUntil: 'networkidle' });
  await holdForNarration();
  await page.waitForTimeout(1000);
} finally {
  const end = now();
  const video = page.video();
  await context.close();
  const videoPath = await video?.path();
  writeFileSync(
    `${OUT}timeline.json`,
    JSON.stringify({ videoPath, end, beats, cuts, narration, captions: BEATS }, null, 2),
  );
  await browser.close();
  log(beats.length === BEATS.length ? 'RECORDING DONE' : `RECORDING STOPPED after step ${current?.id}`);
}

// Makes the Devpost gallery images (3:2, 3000x2000) from frames of the demo video.
//
//   npm run gallery     (after npm run assemble; writes out/gallery/*.jpg)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { chromium } from 'playwright';

const OUT = new URL('./out/gallery/', import.meta.url).pathname;
const VIDEO = new URL('./out/chalkboard-demo.mp4', import.meta.url).pathname;
const MENU_PHOTO = new URL('../web/public/samples/rosas-bakery.jpg', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function frame(seconds) {
  const file = `${OUT}frame-${seconds}.png`;
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(seconds), '-i', VIDEO, '-frames:v', '1', file]);
  return file;
}
const dataUrl = (file) => `data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(file).toString('base64')}`;

const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1500px; height: 1000px; }
  body { font-family: Inter, system-ui, sans-serif; color: #f4f1e8; overflow: hidden;
         background: radial-gradient(ellipse at top, #2f4139, #1b2520 75%); }
  .chalk { font-family: Caveat, 'Chalkboard SE', cursive; font-weight: 700; }
  .shot { border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,.45); display: block; }
  .step { display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 50%;
          background: #f6d77a; color: #1b2520; font-weight: 700; font-size: 22px; margin-right: 16px; }
`;
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

function screenshotSlide({ step, title, subtitle, image, crop }) {
  const clip = crop ? `object-fit: cover; object-position: ${crop};` : '';
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    header { padding: 44px 64px 0; }
    h1 { margin: 0; display: flex; align-items: center; font-size: 46px; }
    p { margin: 10px 0 0 60px; font-size: 22px; color: #c9c6bb; }
    .shot { width: 1290px; height: 780px; margin: 30px auto 0; ${clip} }
  </style></head><body>
    <header><h1 class="chalk"><span class="step">${step}</span>${title}</h1><p>${subtitle}</p></header>
    <img class="shot" src="${dataUrl(image)}">
  </body></html>`;
}

// PayPal's checkout card is tall and narrow, so it gets the right half and the explanation the left.
function paypalSlide(image) {
  const crop = { x: 420, y: 80, width: 600, height: 740 }; // the card within the 1440x900 frame
  const scale = 800 / crop.height;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    .text { position: absolute; left: 70px; top: 70px; width: 690px; }
    h1 { margin: 0; display: flex; align-items: center; font-size: 46px; }
    ol { margin: 44px 0 0; padding: 0; list-style: none; counter-reset: s; }
    li { counter-increment: s; position: relative; padding: 0 0 30px 58px; font-size: 25px; line-height: 1.45; color: #dedad0; }
    li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 38px; height: 38px; border-radius: 50%;
                 border: 2px solid #9fd0f5; color: #9fd0f5; display: grid; place-items: center; font-weight: 700; font-size: 19px; }
    li b { color: #f4f1e8; }
    .card { position: absolute; right: 90px; top: 100px; width: ${crop.width * scale}px; height: ${crop.height * scale}px;
            overflow: hidden; border-radius: 18px; background: #fff; }
    .card img { width: ${1440 * scale}px; margin: ${-crop.y * scale}px 0 0 ${-crop.x * scale}px; display: block; }
  </style></head><body>
    <div class="text"><h1 class="chalk"><span class="step">3</span>They pay on PayPal's own page</h1>
      <ol>
        <li>The assistant's cart becomes a <b>PayPal Orders API</b> order with line items, priced by the server.</li>
        <li>The order's <b>payee is the shop</b>, so the money never passes through Chalkboard.</li>
        <li>The buyer <b>approves on PayPal</b> (sandbox), using any funding source they like.</li>
        <li>Chalkboard <b>captures</b> it and shows the shop what it receives after fees.</li>
      </ol></div>
    <div class="card shot"><img src="${dataUrl(image)}"></div>
  </body></html>`;
}

function coverSlide(shop) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    .title { position: absolute; left: 70px; top: 60px; }
    .title h1 { margin: 0; font-size: 150px; line-height: 1; }
    .title p { margin: 8px 0 0; font-size: 34px; font-weight: 600; }
    .title small { display: block; margin-top: 10px; font-size: 22px; color: #c9c6bb; }
    .photo { position: absolute; left: 80px; top: 360px; width: 470px; transform: rotate(-3deg); }
    .arrow { position: absolute; left: 585px; top: 600px; font-size: 90px; color: #f6d77a; }
    .app { position: absolute; left: 700px; top: 330px; width: 740px; height: 520px; object-fit: cover; object-position: right top; }
    .badges { position: absolute; left: 70px; bottom: 44px; display: flex; gap: 14px; }
    .badges span { padding: 10px 20px; border-radius: 999px; background: rgba(244,241,232,.12);
                   border: 1px solid rgba(244,241,232,.3); font-size: 21px; font-weight: 600; }
  </style></head><body>
    <div class="title"><h1 class="chalk">Chalkboard</h1>
      <p>Snap your menu. Sell to AI shoppers.</p>
      <small>Menu photo → AI-shoppable shop → paid straight to the shop with PayPal</small></div>
    <img class="shot photo" src="${dataUrl(MENU_PHOTO)}">
    <div class="arrow">→</div>
    <img class="shot app" src="${dataUrl(shop)}">
    <div class="badges"><span>Claude Opus 5.5</span><span>PayPal Orders API</span><span>AG Grid</span></div>
  </body></html>`;
}

function diagramSlide() {
  const box = (title, lines, accent = '#f4f1e8') =>
    `<div class="box" style="border-color:${accent}"><b style="color:${accent}">${title}</b>${lines.map((l) => `<span>${l}</span>`).join('')}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    h1 { margin: 44px 64px 0; font-size: 56px; }
    .row { display: flex; align-items: center; justify-content: center; gap: 22px; margin-top: 40px; }
    .box { width: 300px; min-height: 210px; padding: 22px 24px; border: 3px solid; border-radius: 18px;
           background: rgba(0,0,0,.18); display: flex; flex-direction: column; gap: 8px; }
    .box b { font-size: 27px; margin-bottom: 4px; }
    .box span { font-size: 19px; color: #dedad0; line-height: 1.35; }
    .to { font-size: 54px; color: #f6d77a; }
    .core { width: 340px; background: rgba(246,215,122,.08); }
    .up { text-align: center; line-height: 1; margin: 6px 0 4px; }
    .trust { margin: 46px 64px 0; padding: 24px 30px; border-radius: 16px; background: rgba(244,241,232,.08);
             font-size: 23px; line-height: 1.55; color: #f4f1e8; }
    .trust b { color: #f6d77a; }
  </style></head><body>
    <h1 class="chalk">How it works</h1>
    <div class="row">
      ${box('Shop owner', ['Photo of the menu board', 'Reviews it in AG Grid', 'Sees paid orders live'])}
      <div class="to">→</div>
      ${box('Chalkboard', ['<b style="font-size:20px;color:#f4f1e8">Claude Opus 5.5</b>', 'Vision + structured output reads the menu', 'Tool use takes orders: create_checkout, check_order'], '#f6d77a').replace('class="box"', 'class="box core"')}
      <div class="to">→</div>
      ${box('PayPal Orders API', ['Order with line items', 'payee = the shop', 'Buyer approves on PayPal', 'Capture → shop is paid'], '#9fd0f5')}
    </div>
    <div class="up to">↑</div>
    <div class="row" style="margin-top:0">
      ${box('Customer or AI assistant', ['"Anything vegan?"', '"A rye and a latte for 8:30"'])}
    </div>
    <div class="trust"><b>The AI never touches money.</b> Claude picks items and quantities; the server recomputes every
      price from the shop's menu; the buyer approves on PayPal's own page; the payment is captured straight into the
      shop's PayPal account.</div>
  </body></html>`;
}

const slides = [
  { name: '0-cover', html: () => coverSlide(frame(89)) },
  {
    name: '1-read-menu',
    html: () => screenshotSlide({
      step: 1, title: 'Claude reads the chalkboard',
      subtitle: 'Every item and size becomes a product. A smudged price is flagged with the reason, not guessed.',
      image: frame(42.5),
    }),
  },
  {
    name: '2-order-with-ai',
    html: () => screenshotSlide({
      step: 2, title: 'Customers order in plain words',
      subtitle: 'The assistant answers from the menu, skips sold-out items and builds the checkout. Prices come from the server.',
      image: frame(89),
    }),
  },
  { name: '3-paypal-checkout', html: () => paypalSlide(frame(92)) },
  {
    name: '4-owner-dashboard',
    html: () => screenshotSlide({
      step: 4, title: 'The owner sees it paid, live',
      subtitle: 'Orders in AG Grid with exactly what the shop receives after PayPal fees. Untick "On sale" when something sells out.',
      image: frame(101),
    }),
  },
  { name: '5-how-it-works', html: diagramSlide },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
for (const slide of slides) {
  await page.setContent(slide.html(), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}${slide.name}.jpg`, type: 'jpeg', quality: 90 });
  console.log(`  ${slide.name}.jpg`);
}
await browser.close();
execFileSync('sh', ['-c', `rm -f "${OUT}"frame-*.png`]);
console.log(`Gallery written to out/gallery/`);

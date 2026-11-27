// Extra checks from the built dist/ at /dist/: a 360 wide phone, a landscape phone, a tablet, the
// width where the three views go side by side, reduced motion, the page inside an iframe, no sideways
// scroll anywhere, and first-load transfer size. Screenshots go to shots/checks/.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const OUT = fileURLToPath(new URL('../shots/checks/', import.meta.url));
await mkdir(OUT, { recursive: true });
const server = await startServer(5416);
const base = 'http://127.0.0.1:5416/dist/';
const browser = await chromium.launch();
const problems = [];

async function check(name, opts, fn) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  let bytes = 0;
  page.on('response', async (r) => {
    const len = Number(r.headers()['content-length'] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
    bytes += len;
  });
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`${name}: failed ${r.url()}`));
  await fn(page);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (sideways > 0) problems.push(`${name}: sideways scroll of ${sideways}px`);
  console.log(name, 'ok', `(${(bytes / 1024).toFixed(0)} KB loaded, uncompressed)`);
  await ctx.close();
}

const phone = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

try {
  await check('360', phone(360, 780), async (page) => {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT + '360-menu.png' });
    await page.locator('[data-item="everything"] .row-hit').tap();
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '360-item.png' });
    await page.locator('[data-add]').tap();
    await page.locator('[data-cart]').tap();
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '360-cart.png' });
    await page.getByRole('button', { name: 'Keep ordering' }).tap();
    await page.locator('[data-tab="kitchen"]').tap();
    await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + '360-kitchen.png' });
    await page.locator('[data-tab="owner"]').tap();
    await page.screenshot({ path: OUT + '360-owner.png' });
  });
  await check('landscape', phone(844, 390), async (page) => {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT + 'landscape-menu.png' });
    await page.locator('[data-item="latte"] .row-hit').scrollIntoViewIfNeeded();
    await page.locator('[data-item="latte"] .row-hit').tap();
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + 'landscape-item.png' });
    await page.locator('[data-add]').tap();
    await page.locator('[data-tab="kitchen"]').tap();
    await page.screenshot({ path: OUT + 'landscape-kitchen.png' });
  });
  await check('tablet', phone(768, 1024), async (page) => {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT + 'tablet-menu.png' });
    await page.locator('[data-tab="kitchen"]').tap();
    await page.screenshot({ path: OUT + 'tablet-kitchen.png' });
    await page.locator('[data-tab="owner"]').tap();
    await page.screenshot({ path: OUT + 'tablet-owner.png' });
  });
  await check('1280', { viewport: { width: 1280, height: 720 } }, async (page) => {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + 'wide-1280.png' });
  });
  await check('1920', { viewport: { width: 1920, height: 1080 } }, async (page) => {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + 'wide-1920.png' });
  });
  await check('reduced-motion', { ...phone(390, 844), reducedMotion: 'reduce' }, async (page) => {
    await page.goto(base);
    await page.locator('[data-item="plain"] .row-hit').tap();
    await page.locator('[data-add]').tap();
    await page.locator('[data-cart]').tap();
    await page.locator('[data-name]').fill('Ruth');
    await page.locator('[data-send]').tap();
    await page.locator('[data-go-kitchen]').tap();
    await page.waitForTimeout(150);
    const ticket = page.locator('.ticket', { hasText: 'Ruth' });
    if ((await ticket.count()) !== 1) problems.push('reduced-motion: ticket missing');
    if (await ticket.evaluate((el) => el.classList.contains('printing'))) problems.push('reduced-motion: ticket still animates');
    await page.screenshot({ path: OUT + 'reduced-motion-kitchen.png' });
  });
  await check('iframe', { viewport: { width: 1280, height: 800 } }, async (page) => {
    await page.goto('http://127.0.0.1:5416/scripts/iframe-host.html');
    const frame = page.frameLocator('iframe');
    await frame.locator('[data-item="sesame"] .row-hit').click();
    await frame.locator('[data-add]').click();
    await frame.locator('[data-cart]').click();
    await frame.locator('[data-name]').fill('Iris');
    await frame.locator('[data-send]').click();
    await frame.locator('.ticket', { hasText: 'Iris' }).waitFor();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: OUT + 'iframe.png' });
  });
  // Frame times over one attract loop: every rAF interval while the app builds, sends, prints and bumps.
  for (const [label, opts, throttle] of [
    ['frames-desktop', { viewport: { width: 1440, height: 900 } }, 1],
    ['frames-phone-4x-cpu', phone(390, 844), 4],
  ]) {
    await check(label, opts, async (page) => {
      if (throttle > 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      }
      await page.goto(base + '?attract=1');
      await page.waitForFunction(() => document.documentElement.dataset.attractLoop === '2', null, { timeout: 60000 });
      const gaps = await page.evaluate(
        () =>
          new Promise((ok) => {
            const out = [];
            let last = performance.now();
            const tick = (t) => {
              out.push(t - last);
              last = t;
              if (document.documentElement.dataset.attractLoop === '3') ok(out);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
      gaps.sort((a, b) => a - b);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const p95 = gaps[Math.floor(gaps.length * 0.95)];
      const p99 = gaps[Math.floor(gaps.length * 0.99)];
      console.log(`${label}: ${gaps.length} frames, mean ${mean.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, p99 ${p99.toFixed(1)} ms, worst ${gaps.at(-1).toFixed(1)} ms`);
    });
  }
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else console.log('All checks passed.');

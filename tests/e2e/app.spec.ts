import { expect, test, type Page } from '@playwright/test';

// Every test fails on a console error, an uncaught exception or a failed request.
let problems: string[] = [];
function watch(page: Page) {
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`failed ${r.url()}`));
}
test.beforeEach(({ page }) => {
  problems = [];
  watch(page);
});
test.afterEach(() => expect(problems).toEqual([]));

const salesOf = async (page: Page) => Number(await page.locator('[data-sales]').getAttribute('data-sales'));
const doneButton = (page: Page) =>
  page.getByRole('dialog', { name: 'Sold out' }).getByRole('button', { name: 'Done', exact: true });

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('order with touch, watch it print in the kitchen, bump it, see it ready', async ({ page }) => {
    await page.goto('./');
    // Empty cart: no cart bar.
    await expect(page.locator('[data-cart]')).toHaveCount(0);
    await page.locator('[data-item="everything"] .row-hit').tap();
    const add = page.locator('[data-add]');
    await expect(add).toContainText('$2.50');
    await page.locator('[data-choice="toasted:yes"]').tap();
    await page.locator('[data-choice="schmear:scallion"]').tap();
    await expect(add).toContainText('$4.45');
    await page.getByRole('button', { name: 'One more' }).tap();
    await expect(add).toContainText('$8.90');
    await add.tap();
    await page.locator('[data-item="drip"] .row-hit').tap();
    await page.locator('[data-add]').tap();
    await expect(page.locator('[data-cart]')).toContainText('3 items');
    await expect(page.locator('[data-cart]')).toContainText('$11.40');
    await page.locator('[data-cart]').tap();

    // Send is refused without a name, and says why.
    await page.locator('[data-send]').tap();
    await expect(page.getByRole('alert')).toContainText('Add a name');
    await expect(page.getByText('Demo. Nothing is charged or sent.')).toBeVisible();
    await page.locator('[data-name]').fill('Dana');
    await page.locator('[data-send]').tap();
    await expect(page.locator('[data-sent-line]')).toBeVisible();
    const number = await page.locator('[data-sent-number]').getAttribute('data-sent-number');

    await page.locator('[data-go-kitchen]').tap();
    const ticket = page.locator(`[data-ticket="${number}"]`);
    await expect(ticket).toBeVisible();
    await expect(ticket).toHaveClass(/printing/);
    await expect(ticket).not.toHaveClass(/printing/, { timeout: 5000 });
    await expect(ticket).toContainText('Dana');
    await expect(page.locator('[data-allday="everything"] b')).not.toHaveText('0');

    await ticket.locator('[data-line="l0"]').tap();
    await expect(ticket.locator('[data-line="l0"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-tab="menu"]').tap();
    await expect(page.locator('[data-active-order]')).toContainText('Being made');
    await page.locator('[data-tab="kitchen"]').tap();
    await page.locator(`[data-ticket="${number}"] [data-bump]`).tap();
    await page.locator('[data-tab="menu"]').tap();
    await expect(page.locator('[data-active-order]')).toContainText('Ready');
  });

  test('marking an item sold out in the kitchen greys it out on the menu, and it can come back', async ({ page }) => {
    await page.goto('./');
    await page.locator('[data-item="plain"] .row-hit').tap();
    await page.locator('[data-choice="schmear:honey"]').tap();
    await page.locator('[data-add]').tap();
    await page.locator('[data-tab="kitchen"]').tap();
    await page.locator('[data-stock]').tap();
    await page.locator('[data-stock-item="tub-honey"] button').tap();
    await page.locator('[data-stock-item="sesame"] button').tap();
    await doneButton(page).tap();
    await page.locator('[data-tab="menu"]').tap();
    await expect(page.locator('[data-item="sesame"]')).toHaveAttribute('data-available', 'no');
    await expect(page.locator('[data-item="tub-honey"]')).toHaveAttribute('data-available', 'no');
    // The line already in the cart is now flagged and blocks sending until removed.
    await page.locator('[data-cart]').tap();
    await expect(page.locator('.cart-line.out')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText('sold out');
    await page.getByRole('button', { name: 'Remove' }).tap();
    await page.getByRole('button', { name: 'Back to the menu' }).tap();
    await page.locator('[data-tab="kitchen"]').tap();
    await page.locator('[data-stock]').tap();
    await page.locator('[data-stock-item="sesame"] button').tap();
    await doneButton(page).tap();
    await page.locator('[data-tab="menu"]').tap();
    await expect(page.locator('[data-item="sesame"]')).toHaveAttribute('data-available', 'yes');
  });

  test('a reload keeps the day and the order', async ({ page }) => {
    await page.goto('./');
    await page.locator('[data-item="latte"] .row-hit').tap();
    await page.locator('[data-add]').tap();
    await page.locator('[data-cart]').tap();
    await page.locator('[data-name]').fill('Ruth');
    await page.locator('[data-send]').tap();
    const number = await page.locator('[data-sent-number]').getAttribute('data-sent-number');
    await page.reload();
    await expect(page.locator('[data-active-order]')).toContainText(`Order ${number}`);
    await page.locator('[data-tab="kitchen"]').tap();
    await expect(page.locator(`[data-ticket="${number}"]`)).toContainText('Ruth');
    // Tickets that were already on the rail do not print again after a reload.
    await expect(page.locator(`[data-ticket="${number}"]`)).not.toHaveClass(/printing/);
  });
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop only');

  test('the three views stay in step: send, print, bump, and the sales figure moves', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.col-phone [data-view="menu"]')).toBeVisible();
    await expect(page.locator('.col-kitchen [data-view="kitchen"]')).toBeVisible();
    await expect(page.locator('.col-owner [data-view="owner"]')).toBeVisible();
    const before = await salesOf(page);
    const ordersBefore = Number(await page.locator('[data-orders]').getAttribute('data-orders'));

    await page.locator('[data-item="egg-cheese"] .row-hit').click();
    await page.locator('[data-choice="extras:bacon"]').click();
    await expect(page.locator('[data-add]')).toContainText('$10.00');
    await page.locator('[data-add]').click();
    await page.locator('[data-cart]').click();
    await page.locator('[data-name]').fill('A very long name for an order, longer than anyone types');
    await page.locator('[data-send]').click();
    const number = await page.locator('[data-sent-number]').getAttribute('data-sent-number');

    const ticket = page.locator(`[data-ticket="${number}"]`);
    await expect(ticket).toHaveClass(/printing/);
    await expect(page.locator('[data-orders]')).toHaveAttribute('data-orders', String(ordersBefore + 1));
    await expect(ticket).not.toHaveClass(/printing/, { timeout: 5000 });
    // The name is capped at 40 characters.
    await expect(ticket.locator('.t-name')).toHaveText('A very long name for an order, longer th');
    await ticket.locator('[data-bump]').click();
    await expect(page.locator('[data-sent-line]')).toContainText('Ready');
    // Rung up when it is handed over: exactly the order total, in cents.
    await expect.poll(() => salesOf(page)).toBe(before + 1000);
    await expect(page.getByRole('status').filter({ hasText: 'is ready' })).toBeVisible();
  });

  test('a second tab follows over BroadcastChannel', async ({ page, context }) => {
    await page.goto('./');
    const other = await context.newPage();
    watch(other);
    await other.goto('./');
    // The second tab adopts the day of the first tab instead of starting its own.
    const want = await page.locator('[data-orders]').getAttribute('data-orders');
    await expect.poll(() => other.locator('[data-orders]').getAttribute('data-orders')).toBe(want);
    await other.locator('[data-stock]').click();
    await other.locator('[data-stock-item="cold-brew"] button').click();
    await doneButton(other).click();
    await expect(page.locator('[data-item="cold-brew"]')).toHaveAttribute('data-available', 'no');

    await page.locator('[data-item="poppy"] .row-hit').click();
    await page.locator('[data-add]').click();
    await page.locator('[data-cart]').click();
    await page.locator('[data-name]').fill('Keiko');
    await page.locator('[data-send]').click();
    await expect(other.locator('.ticket', { hasText: 'Keiko' })).toBeVisible();
    await other.locator('.ticket', { hasText: 'Keiko' }).locator('[data-bump]').click();
    await expect(page.locator('[data-sent-line]')).toContainText('Ready');
    await other.close();
  });

  test('attract mode plays by itself and hands over on the first touch', async ({ page }) => {
    await page.goto('./?attract=1');
    await expect(page.locator('.app.attract')).toHaveCount(1);
    await expect(page.locator('.ticket.printing')).toHaveCount(1, { timeout: 25000 });
    await page.mouse.click(700, 60);
    await expect(page.locator('.app.attract')).toHaveCount(0);
    await expect(page.locator('.finger')).toHaveCount(0);
    // The visitor now has a live shop: an order goes through.
    await page.locator('[data-item="plain"] .row-hit').click();
    await page.locator('[data-add]').click();
    await page.locator('[data-cart]').click();
    await page.locator('[data-name]').fill('Theo');
    await page.locator('[data-send]').click();
    await expect(page.locator('.ticket', { hasText: 'Theo' })).toBeVisible();
  });
});

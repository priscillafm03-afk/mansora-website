import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const controls = path => fetch(`http://127.0.0.1:3002/${path}`).then(r => r.json());
async function fill(page, email = 'browser@example.com') {
  await page.getByLabel('Your name', { exact: false }).fill('Browser Test Owner');
  await page.getByLabel('Email address', { exact: false }).fill(email);
  await page.getByLabel('Business name', { exact: false }).fill('Browser Test Shop');
  await page.locator('#waitlist-consent').check();
}
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`product page at ${width}px: accessible form and layout`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/sales-stock');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Manage sales.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.ss-hero').getByRole('link', { name: 'Join the waiting list' }).click();
    await expect(page.locator('#waitlist-name')).toBeInViewport();
    await expect(page.locator('#waitlist-consent')).not.toBeChecked();
    const audit = await new AxeBuilder({ page }).include('.ss-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test('homepage and navigation lead to product; keyboard reaches the waiting list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Explore Sales & Inventory' }).click();
  await expect(page).toHaveURL(/\/sales-stock$/);
  await page.keyboard.press('Tab');
  // Skip link is the first focus target on a fresh page.
  await page.goto('/sales-stock');
  await page.keyboard.press('Tab');
  await expect(page.locator('.ss-skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#product-main')).toBeFocused();
});
test('browser → endpoint → real Redis → success, duplicate and Redis restart', async ({ page }) => {
  await controls('reset');
  await page.goto('/sales-stock#waiting-list');
  await fill(page);
  await page.getByRole('button', { name: 'Join the waiting list' }).click();
  await expect(page.getByRole('status')).toContainText('Your early-access request is saved.');
  await expect(page.locator('#waitlist-consent')).not.toBeChecked();
  const { records } = await controls('state');
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ email: 'browser@example.com', name: 'Browser Test Owner', status: 'requested' });
  await controls('restart');
  expect((await controls('state')).records).toEqual(records);
  await fill(page);
  await page.getByRole('button', { name: 'Join the waiting list' }).click();
  await expect(page.getByRole('status')).toContainText('Your early-access request is saved.');
  expect((await controls('state')).records).toEqual(records);
});
test('failure is honest, preserves form values and can recover', async ({ page }) => {
  await controls('reset'); await controls('fail');
  await page.goto('/sales-stock#waiting-list'); await fill(page);
  await page.getByRole('button', { name: 'Join the waiting list' }).click();
  await expect(page.getByRole('status')).toContainText('could not confirm');
  await expect(page.locator('#waitlist-email')).toHaveValue('browser@example.com');
  expect((await controls('state')).records).toHaveLength(0);
  await controls('recover');
  await page.getByRole('button', { name: 'Join the waiting list' }).click();
  await expect(page.getByRole('status')).toContainText('Your early-access request is saved.');
  expect((await controls('state')).records).toHaveLength(1);
});
test('server validation is shown and focus moves to the invalid field', async ({ page }) => {
  await controls('reset');
  await page.goto('/sales-stock#waiting-list'); await fill(page);
  await page.locator('#waitlist-name').evaluate(el => { el.value = 'A'; el.removeAttribute('minlength'); });
  await page.getByRole('button', { name: 'Join the waiting list' }).click();
  await expect(page.locator('#waitlist-name-error')).toContainText('2–100');
  await expect(page.locator('#waitlist-name')).toBeFocused();
  await expect(page.locator('#waitlist-name')).toHaveAttribute('aria-invalid', 'true');
  expect((await controls('state')).records).toHaveLength(0);
});
test('contact and newsletter forms retain their original endpoints', async ({ page }) => {
  await page.goto('/contact-us');
  await expect(page.locator('#contactForm')).toHaveCount(1);
  await expect(page.locator('#newsletterForm')).toHaveCount(1);
  const requests = [];
  await page.route('**/contact', route => { requests.push(route.request().url()); return route.fulfill({ json: { ok: true, reference: 'LOCAL-TEST' } }); });
  await page.locator('#name').fill('Contact Regression Test');
  await page.locator('#email').fill('regression@example.com');
  await page.locator('#service').selectOption({ index: 1 });
  await page.locator('#message').fill('Regression test of existing contact form.');
  await page.locator('#contactForm button[type=submit]').click();
  await expect.poll(() => requests.length).toBe(1);
  await page.route('**/subscribe', route => { requests.push(route.request().url()); return route.fulfill({ json: { ok: true } }); });
  await page.locator('#newsletterEmail').fill('newsletter@example.com');
  await page.locator('#newsletterForm button[type=submit]').click();
  await expect.poll(() => requests.length).toBe(2);
});

test('sample-screen tour supports pointer and keyboard, with honest sample labels', async ({ page }) => {
  await page.goto('/sales-stock');
  await expect(page.getByRole('navigation', { name: 'Sales and inventory page sections' })).toBeVisible();
  await page.getByRole('tab', { name: 'Checkout', exact: true }).click();
  await expect(page.locator('#panel-checkout')).toBeVisible();
  await expect(page.locator('#panel-dashboard')).toBeHidden();
  await expect(page.locator('#panel-checkout img')).toHaveAttribute('src', /checkout.webp$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Stock', exact: true })).toBeFocused();
  await expect(page.locator('#panel-stock')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Dashboard', exact: true })).toBeFocused();
  await expect(page.locator('#panel-dashboard')).toBeVisible();
  await expect(page.locator('.ss-tour-note')).toContainText('synthetic sample records');
  const images = await page.locator('.ss-tour-panel img').evaluateAll(images => Promise.all(images.map(async image => { if (!image.complete) await image.decode(); return image.naturalWidth; })));
  expect(images).toEqual([1366, 1366, 1366]);
});

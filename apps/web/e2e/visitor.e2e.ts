import { expect, test } from '@playwright/test';

/** What a visitor on a phone sees (Phase 9). Runs on desktop and on a Pixel 7 screen. */
test('the home page and search work on a phone without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Offers from shops near you' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByPlaceholder(/shoes under 2000/).fill('running shoes');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.waitForURL(/\/search\?/);
  await expect(page.getByRole('link', { name: /Running shoes/ }).first()).toBeVisible();
});

test('the legal pages open from the footer and say they are drafts', async ({ page }) => {
  await page.goto('/');
  for (const [link, heading] of [
    ['Privacy', 'Privacy policy'],
    ['Terms', 'Terms of use'],
    ['Contact', /^Contact /],
  ] as const) {
    await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Draft, under review.');
  }
});

test('phones get a bottom tab bar, desktops a top search box', async ({ page, isMobile }) => {
  await page.goto('/');
  const tabs = page.getByRole('navigation', { name: 'Sections' });
  const headerSearch = page.getByRole('searchbox', { name: 'Search offers and shops' });
  if (!isMobile) {
    await expect(tabs).toBeHidden();
    await expect(headerSearch).toBeVisible();
    return;
  }
  await expect(headerSearch).toBeHidden();
  await expect(tabs.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'Search' }).click();
  await page.waitForURL(/\/search/);
  await expect(tabs.getByRole('link', { name: 'Search' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'Log in' }).click();
  await page.waitForURL(/\/login/);
});

test('private pages ask visitors to log in', async ({ page }) => {
  await page.goto('/notifications');
  await expect(page.getByText('Please log in to continue.')).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByText('Please log in to continue.')).toBeVisible();
});

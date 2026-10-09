import { expect, test, type Browser, type Page } from '@playwright/test';
import { grantRole, loginWithCode, photo, totp } from './helpers';

/**
 * The MVP success scenario in a real browser (Phase 9): an admin sets up 2-step login, a shop
 * registers and is verified, its offer is approved, and a visitor finds it.
 */
test.describe.configure({ mode: 'serial' });

const run = Date.now().toString(36);
const ADMIN = `admin.${run}@e2e.test`;
const OWNER = `owner.${run}@e2e.test`;
const SHOP = `E2E Shoe House ${run}`;
const OFFER = `Running shoes ${run}`;

let admin: Page;
let owner: Page;
let businessId: string;
let offerId: string;
let authenticatorKey: string;
/** The 30-second step whose code turned 2-step login on (a code works only once). */
let setupStep: number;
const currentStep = () => Math.floor(Date.now() / 30_000);

const newPage = async (browser: Browser) => (await browser.newContext()).newPage();

test('an admin sets up 2-step login before using the admin area', async ({ browser }) => {
  admin = await newPage(browser);
  await loginWithCode(admin, ADMIN, 'E2E Admin');
  grantRole(ADMIN, 'SUPER_ADMIN');

  await admin.goto('/admin');
  await admin.waitForLoadState('networkidle'); // the form must be hydrated before typing
  await expect(admin.getByText('To use the admin area, set up 2-step login first.')).toBeVisible();
  await admin.getByRole('button', { name: 'Set up 2-step login' }).click();
  await expect(admin.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
  authenticatorKey = (await admin.locator('span.font-mono').first().innerText()).trim();
  expect(authenticatorKey).toMatch(/^[A-Z2-7]{32}$/);

  await admin.getByLabel('6-digit code from your authenticator app').fill('000000');
  await admin.getByRole('button', { name: 'Turn on' }).click();
  await expect(admin.getByText('That code is not correct')).toBeVisible();

  setupStep = currentStep();
  await admin.getByLabel('6-digit code from your authenticator app').fill(totp(authenticatorKey));
  await admin.getByRole('button', { name: 'Turn on' }).click();
  await expect(admin.getByText("Save these recovery codes now. They won't be shown again.")).toBeVisible();
  await admin.getByRole('button', { name: 'I saved them' }).click();
  await expect(admin.getByRole('heading', { name: 'Review queues' })).toBeVisible();
});

test('a shop owner registers a business with a shop photo and submits it', async ({ browser }) => {
  owner = await newPage(browser);
  await loginWithCode(owner, OWNER, 'E2E Owner');
  await owner.goto('/business/new');
  await owner.waitForLoadState('networkidle'); // the form must be hydrated before typing
  await owner.locator('#b-name').fill(SHOP);
  await owner.locator('#b-cat').selectOption({ label: 'Footwear' });
  await owner.locator('#b-phone').fill('0836 225 5123');
  await owner.locator('#b-a1').fill('Shop 4, Main Road');
  await owner.locator('#b-city').selectOption({ label: 'Hubballi' });
  await owner.locator('#b-lat').fill('15.3647');
  await owner.locator('#b-lng').fill('75.1240');
  await owner.getByRole('button', { name: 'Register business' }).click();
  await owner.waitForURL(/\/business\/[0-9a-f-]{36}$/);
  businessId = owner.url().split('/').pop()!;

  const chooser = owner.waitForEvent('filechooser');
  await owner.getByRole('button', { name: 'Add shop photo' }).click();
  await (await chooser).setFiles(await photo(owner));
  await expect(owner.getByRole('button', { name: 'Add shop photo' })).toBeEnabled();
  await owner.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(owner.getByText('under review', { exact: false }).first()).toBeVisible();
});

test('the admin verifies the business', async () => {
  await admin.goto(`/admin/businesses/${businessId}`);
  await admin.waitForLoadState('networkidle'); // the form must be hydrated before typing
  await expect(admin.getByText(SHOP).first()).toBeVisible();
  await admin.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(admin.getByText('verified', { exact: false }).first()).toBeVisible();
});

test('the owner creates an offer (discount worked out by the server) and submits it', async () => {
  await owner.goto(`/business/${businessId}/offers/new`);
  await owner.waitForLoadState('networkidle'); // the form must be hydrated before typing
  await owner.locator('#o-title').fill(OFFER);
  await owner.locator('#o-type').selectOption('PERCENTAGE_OFF');
  await owner.locator('#o-cat').selectOption({ label: 'Footwear' });
  await owner.locator('#p-discountPercent').fill('40');
  await owner.getByRole('button', { name: 'Save as draft' }).click();
  await owner.waitForURL(/\/business\/offers\/[0-9a-f-]{36}$/);
  offerId = owner.url().split('/').pop()!;
  await owner.getByRole('button', { name: 'Submit for review' }).click();
  await expect(owner.getByText('pending', { exact: false }).first()).toBeVisible();
});

test('the admin approves the offer', async () => {
  await admin.goto(`/admin/offers/${offerId}`);
  await admin.waitForLoadState('networkidle'); // the form must be hydrated before typing
  await expect(admin.getByText(OFFER).first()).toBeVisible();
  await admin.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(admin.getByText('active', { exact: false }).first()).toBeVisible();
});

test('a visitor finds the offer by search and opens it', async ({ browser }) => {
  const visitor = await newPage(browser);
  await visitor.goto(`/search?q=${encodeURIComponent(`running shoes ${run}`)}`);
  await visitor.waitForLoadState('networkidle'); // the form must be hydrated before typing
  await visitor.getByRole('link', { name: new RegExp(OFFER) }).first().click();
  await expect(visitor.getByRole('heading', { name: OFFER })).toBeVisible();
  await expect(visitor.getByText('40% OFF').first()).toBeVisible();
  await expect(visitor.getByText(SHOP).first()).toBeVisible();
});

test('logging in again asks the admin for the authenticator code', async ({ browser }) => {
  const again = await newPage(browser);
  await again.goto('/login');
  await again.getByPlaceholder('you@example.com').fill(ADMIN);
  await again.getByLabel('Password').fill('E2e-Kadak-Chai-2026');
  await again.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(again.getByRole('heading', { name: '2-step login' })).toBeVisible();
  // A fresh code: the current step if setup used an earlier one, else the next (one step of drift is allowed).
  await again.getByLabel('Authenticator code').fill(totp(authenticatorKey, currentStep() > setupStep ? 0 : 1));
  await again.getByRole('button', { name: 'Continue' }).click();
  await again.waitForURL((url) => !url.pathname.startsWith('/login'));
  await again.goto('/admin/insights');
  await expect(again.getByRole('heading', { name: 'Insights' })).toBeVisible();
});

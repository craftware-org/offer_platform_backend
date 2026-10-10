import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../api');
const API_LOG = process.env.E2E_API_LOG ?? resolve(API_DIR, 'api.log');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The newest login code the API printed for this address. Only the console email provider (local
 * and CI runs, never production) prints codes; addresses are masked in the log, so we take the
 * newest code written after `since`.
 */
export async function latestEmailCode(since: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const lines = readFileSync(API_LOG, 'utf8').split('\n').slice(since);
    const codes = lines.filter((l) => l.includes('[DEV EMAIL]')).map((l) => l.match(/\b(\d{6})\b/)?.[1]).filter(Boolean);
    if (codes.length) return codes.at(-1)!;
    await sleep(250);
  }
  throw new Error(`No login code found in ${API_LOG}`);
}

export const logLength = () => readFileSync(API_LOG, 'utf8').split('\n').length;

/** Logs in (or signs up) with an email code; finishes the welcome step for new accounts. */
export async function loginWithCode(page: Page, email: string, name: string): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByRole('button', { name: 'Log in with a code instead' }).click();
  const since = logLength();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('textbox', { name: 'Code' }).fill(await latestEmailCode(since - 1));
  await page.getByRole('textbox', { name: 'Code' }).press('Enter');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  // New accounts land on /account?welcome=1 to choose a name and a password.
  if (new URL(page.url()).searchParams.get('welcome') === '1') {
    const welcome = page.getByRole('heading', { name: 'Welcome! Finish setting up your account' });
    await page.getByLabel('Your name').fill(name);
    await page.getByLabel('Password', { exact: true }).fill('E2e-Kadak-Chai-2026');
    await page.getByLabel('Confirm password').fill('E2e-Kadak-Chai-2026');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(welcome).toBeHidden();
  }
}

/** Grants an admin role with the server's bootstrap command, as on a real server. */
export function grantRole(email: string, role: 'ADMIN' | 'SUPER_ADMIN'): void {
  execFileSync('node', ['dist/cli/grant-role.js', '--email', email, '--role', role], { cwd: API_DIR, stdio: 'pipe' });
}

/** What the authenticator app shows for this key right now (RFC 6238, 30 s, 6 digits). */
export function totp(base32Key: string, stepOffset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of base32Key.toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset));
  const mac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** A real image (a screenshot of the page) to upload as a shop photo. */
export async function photo(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  return { name: 'shop.png', mimeType: 'image/png', buffer: await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } }) };
}

/**
 * Opens Playwright's Chromium with the unpacked APIlot extension (dist/chrome-mv3).
 *
 * Usage:
 *   npm run build:chrome
 *   yarn playwright:extension
 *   yarn playwright:extension --fresh   # wipe profile (fixes storage quota)
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'dist/chrome-mv3');
const userDataDir = path.join(root, '.playwright-apilot-profile');
const freshProfile = process.argv.includes('--fresh');

if (!existsSync(path.join(extensionPath, 'manifest.json'))) {
  console.error('Extension not found. Run: npm run build:chrome');
  process.exit(1);
}

if (freshProfile && existsSync(userDataDir)) {
  rmSync(userDataDir, { recursive: true, force: true });
  console.log('Removed Playwright profile:', userDataDir);
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

let page = context.pages()[0];
if (!page) page = await context.newPage();
await page.goto('https://example.com');

console.log('Chromium (Playwright) is open with APIlot loaded from:\n ', extensionPath);
console.log(
  'Service worker logs (DNR sync): chrome://extensions → APIlot → "Service worker" → Inspect'
);
if (!freshProfile) {
  console.log(
    'If you see storage quota errors, restart with: yarn playwright:extension --fresh'
  );
}
console.log('Close the browser when finished.');

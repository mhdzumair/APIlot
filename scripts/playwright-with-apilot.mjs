/**
 * Opens Playwright's Chromium with the unpacked APIlot extension (dist/chrome-mv3).
 * Run after: npm run build:chrome
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'dist/chrome-mv3');
const userDataDir = path.join(root, '.playwright-apilot-profile');

if (!existsSync(path.join(extensionPath, 'manifest.json'))) {
  console.error('Extension not found. Run: npm run build:chrome');
  process.exit(1);
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

console.log('Chromium (Playwright) is open with APIlot loaded from:\n', extensionPath);
console.log('Use chrome://extensions to verify. Close the browser when finished.');

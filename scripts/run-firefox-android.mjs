/**
 * Run APIlot on Firefox for Android via ADB.
 *
 * Prerequisites:
 *   - Android device connected via USB with USB debugging enabled
 *   - ADB installed and device visible in `adb devices`
 *   - Firefox (Fenix) or Firefox Nightly installed on the device
 *
 * Usage:
 *   npm run dev:firefox-android
 *   npm run dev:firefox-android -- --adb-device <device-serial>
 *   npm run dev:firefox-android -- --firefox-apk org.mozilla.firefox
 *
 * The script builds the Firefox extension first, then uses web-ext-run to
 * side-load it on the device. ADB must be on PATH (or set ANDROID_HOME).
 *
 * Common --firefox-apk values:
 *   org.mozilla.fenix          Firefox (stable)
 *   org.mozilla.firefox_beta   Firefox Beta
 *   org.mozilla.fenix.nightly  Firefox Nightly (older naming)
 *   org.mozilla.firefox        Firefox (some builds)
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import webext from 'web-ext-run';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'dist', 'firefox-mv2');

// Parse CLI args: --adb-device <id>, --firefox-apk <apk>, --no-build
const args = process.argv.slice(2);
const get = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};
const adbDevice = get('--adb-device');
const firefoxApk = get('--firefox-apk') ?? 'org.mozilla.fenix';
const skipBuild = args.includes('--no-build');

if (!skipBuild) {
  console.log('Building Firefox extension…');
  execSync('npm run build:firefox', { cwd: rootDir, stdio: 'inherit' });
}

console.log(`Launching on device: ${adbDevice ?? '(auto-detect)'}`);
console.log(`Firefox APK: ${firefoxApk}`);
console.log(`Source: ${sourceDir}\n`);

await webext.cmd.run(
  {
    sourceDir,
    artifactsDir: path.join(rootDir, 'dist', 'web-ext-artifacts'),
    target: ['firefox-android'],
    firefoxApk,
    adbDevice,
    noInput: false,
    noReload: false,
    verbose: false,
  },
  { shouldExitProgram: false },
);

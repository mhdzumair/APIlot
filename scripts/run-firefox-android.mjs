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
let adbDevice = get('--adb-device');
const firefoxApk = get('--firefox-apk'); // undefined = let web-ext-run auto-discover
const skipBuild = args.includes('--no-build');

// Auto-select the device when exactly one is connected — web-ext-run always
// requires an explicit serial even when there is no ambiguity.
if (!adbDevice) {
  try {
    const adbOut = execSync('adb devices', { encoding: 'utf8' });
    const devices = adbOut
      .split('\n')
      .slice(1) // skip the "List of devices attached" header
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('*') && l.includes('\t'))
      .map((l) => l.split('\t')[0].trim());

    if (devices.length === 1) {
      adbDevice = devices[0];
      console.log(`Auto-selected device: ${adbDevice}`);
    } else if (devices.length > 1) {
      console.error('Multiple devices connected. Specify one with --adb-device <serial>:');
      devices.forEach((d) => console.error(`  ${d}`));
      process.exit(1);
    } else {
      console.error('No Android devices found. Connect a device with USB debugging enabled.');
      process.exit(1);
    }
  } catch {
    console.error('Could not run `adb devices`. Make sure ADB is installed and on PATH.');
    process.exit(1);
  }
}

if (!skipBuild) {
  console.log('Building Firefox extension…');
  execSync('npm run build:firefox', { cwd: rootDir, stdio: 'inherit' });
}

console.log(`Launching on device: ${adbDevice}`);
console.log(`Firefox APK: ${firefoxApk ?? '(auto-discover)'}`);
console.log(`Source: ${sourceDir}\n`);

await webext.cmd.run(
  {
    sourceDir,
    artifactsDir: path.join(rootDir, 'dist', 'web-ext-artifacts'),
    target: ['firefox-android'],
    adbDevice,
    adbRemoveOldArtifacts: true,
    ...(firefoxApk ? { firefoxApk } : {}),
    noInput: false,
    noReload: false,
    verbose: false,
  },
  { shouldExitProgram: false },
);

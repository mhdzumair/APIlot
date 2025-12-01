#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Build configuration
const BUILD_DIR = path.join(__dirname, '..', 'dist');
const SRC_DIR = path.join(__dirname, '..');
const FIREFOX_DIR = path.join(BUILD_DIR, 'firefox');
const CHROME_DIR = path.join(BUILD_DIR, 'chrome');

// Files to copy to both builds
const COMMON_FILES = [
  'src/',
  'assets/',
  'README.md'
];

// Files specific to each browser
const BROWSER_SPECIFIC = {
  firefox: {
    manifest: 'manifest.json',
    background: 'src/background/background.js'
  },
  chrome: {
    manifest: 'manifest-v3.json',
    background: 'src/background/service-worker.js'
  }
};

console.log('🚀 Building GraphQL Testing Toolkit for multiple browsers...\n');

// Clean and create build directories
function setupBuildDirs() {
  console.log('📁 Setting up build directories...');

  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }

  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(FIREFOX_DIR, { recursive: true });
  fs.mkdirSync(CHROME_DIR, { recursive: true });

  console.log('✅ Build directories created\n');
}

// Copy files recursively
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const files = fs.readdirSync(src);
    files.forEach(file => {
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy common files to both builds
function copyCommonFiles() {
  console.log('📋 Copying common files...');

  COMMON_FILES.forEach(file => {
    const srcPath = path.join(SRC_DIR, file);

    if (fs.existsSync(srcPath)) {
      console.log(`  📄 Copying ${file}...`);
      copyRecursive(srcPath, path.join(FIREFOX_DIR, file));
      copyRecursive(srcPath, path.join(CHROME_DIR, file));
    } else {
      console.warn(`  ⚠️  ${file} not found, skipping...`);
    }
  });

  console.log('✅ Common files copied\n');
}

// Build Firefox version
function buildFirefox() {
  console.log('🦊 Building Firefox version...');

  // Copy Firefox manifest
  const firefoxManifest = path.join(SRC_DIR, BROWSER_SPECIFIC.firefox.manifest);
  if (fs.existsSync(firefoxManifest)) {
    fs.copyFileSync(firefoxManifest, path.join(FIREFOX_DIR, 'manifest.json'));
    console.log('  📄 Firefox manifest copied');
  } else {
    console.error('  ❌ Firefox manifest not found!');
    process.exit(1);
  }

  console.log('✅ Firefox build completed\n');
}

// Build Chrome version
function buildChrome() {
  console.log('🌐 Building Chrome version...');

  // Copy Chrome manifest
  const chromeManifest = path.join(SRC_DIR, BROWSER_SPECIFIC.chrome.manifest);
  if (fs.existsSync(chromeManifest)) {
    fs.copyFileSync(chromeManifest, path.join(CHROME_DIR, 'manifest.json'));
    console.log('  📄 Chrome manifest copied');
  } else {
    console.error('  ❌ Chrome manifest not found!');
    process.exit(1);
  }

    // Clean up browser-specific files
  const chromeBackgroundDir = path.join(CHROME_DIR, 'src', 'background');
  const firefoxBackgroundDir = path.join(FIREFOX_DIR, 'src', 'background');

  // Remove Firefox-specific files from Chrome build
  const filesToRemoveFromChrome = ['background.js', 'firefox-adapter.js'];
  filesToRemoveFromChrome.forEach(file => {
    const filePath = path.join(chromeBackgroundDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  🗑️  Removed ${file} from Chrome build`);
    }
  });

  // Remove Chrome-specific files from Firefox build
  const filesToRemoveFromFirefox = ['service-worker.js', 'chrome-adapter.js'];
  filesToRemoveFromFirefox.forEach(file => {
    const filePath = path.join(firefoxBackgroundDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  🗑️  Removed ${file} from Firefox build`);
    }
  });

  console.log('✅ Chrome build completed\n');
}

// Create ZIP packages
function createPackages() {
  console.log('📦 Creating distribution packages...');

  try {
    // Create Firefox package
    console.log('  📦 Creating Firefox package...');
    execSync(`cd "${FIREFOX_DIR}" && zip -r "../graphql-testing-toolkit-firefox.zip" .`, { stdio: 'inherit' });
    console.log('  ✅ Firefox package created: dist/graphql-testing-toolkit-firefox.zip');

    // Create Chrome package
    console.log('  📦 Creating Chrome package...');
    execSync(`cd "${CHROME_DIR}" && zip -r "../graphql-testing-toolkit-chrome.zip" .`, { stdio: 'inherit' });
    console.log('  ✅ Chrome package created: dist/graphql-testing-toolkit-chrome.zip');

  } catch (error) {
    console.error('❌ Failed to create packages:', error.message);
    console.log('💡 Make sure zip is installed on your system');
  }

  console.log('✅ Packages created\n');
}

// Generate build info
function generateBuildInfo() {
  const buildInfo = {
    timestamp: new Date().toISOString(),
    version: JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'package.json'), 'utf8')).version,
    browsers: {
      firefox: {
        manifest: 'v2',
        background: 'persistent script',
        package: 'graphql-testing-toolkit-firefox.zip'
      },
      chrome: {
        manifest: 'v3',
        background: 'service worker',
        package: 'graphql-testing-toolkit-chrome.zip'
      }
    }
  };

  fs.writeFileSync(
    path.join(BUILD_DIR, 'build-info.json'),
    JSON.stringify(buildInfo, null, 2)
  );

  console.log('📊 Build information saved to dist/build-info.json\n');
}

// Main build process
function main() {
  try {
    setupBuildDirs();
    copyCommonFiles();
    buildFirefox();
    buildChrome();
    createPackages();
    generateBuildInfo();

    console.log('🎉 Build completed successfully!');
    console.log('📁 Output directory: dist/');
    console.log('🦊 Firefox build: dist/firefox/');
    console.log('🌐 Chrome build: dist/chrome/');
    console.log('📦 Packages: dist/*.zip');

  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };

import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// Phase 0→10: WXT scaffold. Each phase replaces legacy code with typed React.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  // srcDir: 'src' makes WXT auto-set the @/ alias to src/.
  // entrypointsDir is resolved relative to srcDir, so '../entrypoints' → project-root/entrypoints/.
  srcDir: 'src',
  entrypointsDir: '../entrypoints',
  outDir: 'dist',

  vite: () => ({
    plugins: [tailwindcss()],
  }),

  // Assets in public/ are copied as-is to the extension output root.
  publicDir: 'public',

  manifest: ({ browser: _browser, manifestVersion }) => {
    const icons = {
      16: 'assets/icons/icon-16.png',
      32: 'assets/icons/icon-32.png',
      48: 'assets/icons/icon-48.png',
      128: 'assets/icons/icon-128.png',
    };

    if (manifestVersion === 3) {
      return {
        name: 'APIlot',
        version: '2.2.0',
        icons,
        permissions: [
          'activeTab',
          'storage',
          'webRequest',
          'webNavigation',
          'declarativeNetRequest',
          'declarativeNetRequestWithHostAccess',
        ] as any[],
        host_permissions: ['<all_urls>'],
        web_accessible_resources: [
          { resources: ['injected.js'], matches: ['<all_urls>'] },
        ] as any,
      };
    }

    // Firefox MV2
    return {
      name: 'APIlot',
      version: '2.2.0',
      icons,
      permissions: [
        'activeTab',
        'storage',
        '<all_urls>',
        'devtools',
        'tabs',
        'webRequest',
        'webRequestBlocking',
        'webNavigation',
      ] as any[],
      web_accessible_resources: ['injected.js'] as any,
      browser_specific_settings: {
        gecko: {
          id: 'apilot@mohamed.zumair',
          data_collection_permissions: { required: ['none'] },
        },
      },
    };
  },
});

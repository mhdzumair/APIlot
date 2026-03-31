import { defineConfig } from 'wxt';

// Phase 0: WXT scaffold — legacy scripts served from public/src-legacy/
// Each phase gradually replaces legacy code with typed React components.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  // Assets in public/ are copied as-is to the extension output root.
  // public/assets/       → assets/
  // public/src-legacy/   → src-legacy/  (symlink → ../src-legacy)
  publicDir: 'public',

  manifest: ({ browser: _browser, manifestVersion }) => {
    const icons = {
      16: 'assets/icons/icon-16.png',
      32: 'assets/icons/icon-32.png',
      48: 'assets/icons/icon-48.png',
      128: 'assets/icons/icon-128.png',
    };

    const contentScripts = [
      {
        matches: ['<all_urls>'],
        js: ['src-legacy/content/content-script.js'],
        run_at: 'document_start',
        all_frames: true,
      },
    ];

    if (manifestVersion === 3) {
      return {
        name: 'APIlot',
        version: '2.1.0',
        icons,
        permissions: ['activeTab', 'storage', 'webRequest'] as any[],
        host_permissions: ['<all_urls>'],
        action: {
          default_title: 'APIlot',
          default_popup: 'src-legacy/popup/popup.html',
          default_icon: { 16: 'assets/icons/icon-16.png', 48: 'assets/icons/icon-48.png' },
        },
        background: {
          service_worker: 'src-legacy/background/service-worker.js',
          type: 'classic',
        } as any,
        content_scripts: contentScripts as any,
        web_accessible_resources: [
          {
            resources: [
              'src-legacy/content/injected-script.js',
              'src-legacy/libs/highlight.min.js',
              'src-legacy/libs/json.min.js',
              'src-legacy/libs/graphql.min.js',
              'src-legacy/libs/chart.min.js',
              'src-legacy/libs/highlight-dark.css',
              'src-legacy/libs/highlight-light.css',
              'src-legacy/services/ai-mock-service.js',
              'src-legacy/services/performance-tracker.js',
              'src-legacy/services/session-recorder.js',
              'src-legacy/devtools/panel-extensions.js',
            ],
            matches: ['<all_urls>'],
          },
        ] as any,
      };
    }

    // Firefox MV2
    return {
      name: 'APIlot',
      version: '2.1.0',
      icons,
      permissions: [
        'activeTab',
        'storage',
        '<all_urls>',
        'devtools',
        'tabs',
        'webRequest',
        'webRequestBlocking',
      ] as any[],
      browser_action: {
        default_title: 'APIlot',
        default_popup: 'src-legacy/popup/popup.html',
        default_icon: { 16: 'assets/icons/icon-16.png', 48: 'assets/icons/icon-48.png' },
      },
      background: {
        scripts: [
          'src-legacy/shared/apilot-rule-match.js',
          'src-legacy/background/core.js',
          'src-legacy/background/icon-manager.js',
          'src-legacy/background/firefox-adapter.js',
          'src-legacy/background/background.js',
        ],
        persistent: true,
      } as any,
      content_scripts: contentScripts as any,
      web_accessible_resources: [
        'src-legacy/content/injected-script.js',
        'src-legacy/libs/highlight.min.js',
        'src-legacy/libs/json.min.js',
        'src-legacy/libs/graphql.min.js',
        'src-legacy/libs/chart.min.js',
        'src-legacy/libs/highlight-dark.css',
        'src-legacy/libs/highlight-light.css',
        'src-legacy/services/ai-mock-service.js',
        'src-legacy/services/performance-tracker.js',
        'src-legacy/services/session-recorder.js',
        'src-legacy/devtools/panel-extensions.js',
      ] as any,
      browser_specific_settings: {
        gecko: {
          id: 'apilot@mohamed.zumair',
          data_collection_permissions: { required: ['none'] },
        },
      },
    };
  },
});

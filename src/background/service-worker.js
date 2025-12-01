// Chrome Service Worker using shared core
// Import shared components
importScripts('core.js', 'icon-manager.js', 'chrome-adapter.js');

class GraphQLTestingEngine {
    constructor() {
        this.adapter = new ChromeAdapter();
        this.core = new GraphQLTestingCore(this.adapter);
        this.setupMessageListeners();
        console.log('GraphQL Testing Toolkit Chrome service worker loaded');
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.core.handleMessage(message, sender, sendResponse);
            return true; // Async response
        });
    }
}

// Initialize the extension
const graphqlTesting = new GraphQLTestingEngine();

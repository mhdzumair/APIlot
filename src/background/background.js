// Firefox Background Script using shared core
// Dependencies (core.js, firefox-adapter.js) are loaded by manifest.json

class GraphQLTestingEngine {
    constructor() {
        this.adapter = new FirefoxAdapter();
        this.core = new GraphQLTestingCore(this.adapter);
        this.setupMessageListeners();
        console.log('GraphQL Testing Toolkit Firefox background script loaded');
    }

    setupMessageListeners() {
        const runtime = chrome.runtime || browser.runtime;
        runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.core.handleMessage(message, sender, sendResponse);
            return true; // Async response
        });
    }
}

// Initialize the extension
const graphqlTesting = new GraphQLTestingEngine();

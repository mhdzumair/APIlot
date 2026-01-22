# APIlot

**Your AI Copilot for API Testing**

A powerful browser extension for GraphQL and REST API development, testing, and debugging. Seamlessly integrated into browser DevTools with AI-powered mock generation, performance analytics, and time-travel debugging.

## 🚀 Key Features

### 📊 **Request Monitoring**
- Automatic detection of both GraphQL and REST API requests
- Real-time monitoring with detailed request/response data
- Advanced in-code search (Ctrl/Cmd+F) within code blocks
- Request filtering by type (GraphQL/REST), status, and search terms

### 🤖 **AI-Powered Mock Generation**
- Generate realistic mock data using AI (OpenAI GPT-4 / Anthropic Claude)
- Intelligent field-type recognition for contextual data
- One-click mock generation from GraphQL schema
- Support for complex nested objects and arrays

### 🗂️ **Schema Explorer**
- Auto-detects GraphQL endpoints and authentication from network traffic
- Interactive schema browsing with expandable field trees
- Smart authentication (Bearer tokens, API keys, custom headers)
- One-click intelligent query generation
- Execute queries directly from the explorer

### 🎨 **Visual Query Builder**
- Click-to-add interface for building complex queries
- Real-time query preview with syntax highlighting
- Visual argument configuration with smart defaults
- Nested field selection with Select All/Deselect All
- Seamless switch between visual builder and code editor

### ⚙️ **Smart Rule Engine**
- Create rules to modify both GraphQL and REST requests in real-time
- Simulate network conditions (delays, failures, slow responses)
- Mock custom responses for testing edge cases
- Modify variables, headers, and status codes dynamically
- Support for URL pattern matching with wildcards

### 📈 **Performance Analytics**
- Real-time dashboard with response time metrics
- Track average response time, success rate, and request count
- Visual charts for response time trends
- Top 5 slowest requests identification
- AI-powered performance recommendations

### ⏱️ **Time-Travel Debugging**
- Record complete API request/response sequences
- Replay sessions with adjustable playback speed
- Edit responses mid-replay for debugging
- Export/import sessions for team sharing
- Visual timeline with request details

### 💾 **Developer Tools**
- Export/import rule configurations for team sharing
- Multiple logging levels (Silent to Debug)
- Clean DevTools integration
- Local data storage (no external servers)

## 📦 Installation

### Chrome Web Store
*Coming Soon*

### Firefox Add-ons
*Coming Soon*

### From Source (Development)

**Chrome:**
1. Download and extract the source code
2. Run `npm run build:chrome`
3. Open `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the `dist/chrome` folder

**Firefox:**
1. Download and extract the source code
2. Run `npm run build:firefox`
3. Open `about:debugging`
4. Click "This Firefox" → "Load Temporary Add-on"
5. Select `dist/firefox/manifest.json`

## 🛠️ Quick Start

1. **Install the extension** and open DevTools (F12)
2. **Find the "APIlot" tab** in DevTools
3. **Enable monitoring** using the toggle switch
4. **Start making API requests** - they'll appear automatically

### AI Mock Generation Setup
1. Go to **AI Settings** tab
2. **Select your AI provider** (OpenAI or Anthropic)
3. **Enter your API key**
4. **Test the connection**
5. Use **"AI Generate Mock"** buttons throughout the app

### Schema Explorer Setup
1. Go to **Schema Explorer** tab
2. **Use auto-detected endpoints** (recommended) or enter manually
3. **Configure authentication** if needed
4. **Click "Load Schema"** to explore your GraphQL API
5. **Generate and execute queries** with one click

### Rule Engine
1. Go to **Rules** tab
2. **Click "Add Rule"**
3. **Select request type** (GraphQL, REST, or Both)
4. **Configure pattern matching** (operation name, URL, HTTP method)
5. **Set action** (delay, mock, modify, block)
6. **Save and enable** the rule

### Time-Travel Debugging
1. Go to **Time-Travel** tab
2. **Click "Record"** to start capturing requests
3. **Perform your workflow** in the application
4. **Click "Stop"** when done
5. **Replay, edit, and export** your session

## 📋 Use Cases

### For Developers
- **Progressive Loading**: Test UI with delayed data loading
- **Error Handling**: Validate app behavior with failed requests
- **Performance**: Simulate slow network conditions
- **API Exploration**: Browse and test GraphQL schemas interactively
- **Mock Data**: Generate realistic test data with AI

### For QA Engineers
- **Regression Testing**: Apply consistent test scenarios
- **Edge Cases**: Test with partial or missing data
- **User Experience**: Validate loading states and error messages
- **Cross-Environment**: Share test configurations across teams
- **Session Recording**: Capture and replay complex workflows

## 🔧 Rule Examples

### Delay Specific Operations (GraphQL)
```json
{
  "name": "Slow Loading Test",
  "requestType": "graphql",
  "operationName": "GetUsers",
  "action": "delay",
  "delayMs": 3000
}
```

### Mock REST API Response
```json
{
  "name": "Mock User List",
  "requestType": "rest",
  "httpMethod": "GET",
  "urlPattern": "/api/users",
  "action": "mock",
  "statusCode": 200,
  "mockResponse": {
    "users": [{"id": 1, "name": "Test User"}]
  }
}
```

### Simulate Server Error
```json
{
  "name": "Server Error Test",
  "requestType": "rest",
  "urlPattern": "/api/*",
  "action": "mock",
  "statusCode": 500,
  "mockResponse": {
    "error": "Internal Server Error"
  }
}
```

## 🏗️ Architecture

- **Background Script**: Rule engine and request interception
- **Content Script**: Bridge between page and extension
- **Injected Script**: API request detection in page context
- **DevTools Panel**: Main UI for all features
- **AI Services**: Mock generation with multiple providers
- **Performance Tracker**: Metrics collection and analysis
- **Session Recorder**: Time-travel debugging engine
- **Local Storage**: Rule, session, and preference persistence

## 🌐 Browser Support

- **Chrome**: 88+ (Manifest V3)
- **Firefox**: 88+ (Manifest V2)
- **Edge**: Chromium-based versions

## 🔒 Privacy & Security

- **Local Storage Only**: All data stays on your device
- **No External Servers**: No data transmission to third parties (except AI providers when configured)
- **DevTools Only**: Only active when DevTools are open
- **CSP Compliant**: Follows browser security policies
- **Bundled Libraries**: No remote code loading
- **Secure API Key Storage**: API keys stored locally in browser storage

## 🐛 Troubleshooting

**Extension not detecting requests?**
- Ensure monitoring is enabled for the current tab
- Refresh page after enabling extension
- Check browser console for errors

**Rules not applying?**
- Verify rule is enabled (green indicator)
- Check pattern matching (case-sensitive for GraphQL operations)
- Ensure extension is globally enabled

**AI mock generation not working?**
- Verify API key is correct in AI Settings
- Test connection using the "Test Connection" button
- Check if you have API credits/quota available

**DevTools tab missing?**
- Look for "APIlot" alongside Console, Network tabs
- Try disabling/re-enabling extension
- Restart browser if needed

## 📈 Roadmap

### ✅ Completed
- [x] GraphQL request monitoring and mocking
- [x] REST API support
- [x] AI-powered mock generation
- [x] Performance analytics dashboard
- [x] Time-travel debugging
- [x] Visual query builder
- [x] Schema explorer

### 🚧 In Progress
- [ ] Chrome Web Store publication
- [ ] Firefox Add-ons store publication

### 📋 Planned
- [ ] GraphQL subscription testing
- [ ] WebSocket support
- [ ] Team collaboration features
- [ ] CI/CD integration hooks
- [ ] Schema diff and versioning
- [ ] Query history and favorites

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/mhdzumair/apilot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mhdzumair/apilot/discussions)
- **Documentation**: This README and in-extension help

---

**APIlot - Your AI copilot for API testing. Navigate any API scenario with confidence! ✈️**

# GraphQL Testing Toolkit

A professional browser extension for GraphQL development, testing, and debugging. Seamlessly integrated into browser DevTools with comprehensive GraphQL tooling.

## 🚀 Key Features

### 📊 **Request Monitoring**
- Automatic GraphQL request detection and logging
- Real-time monitoring with detailed request/response data
- Advanced in-code search (Ctrl/Cmd+F) within code blocks
- Request filtering and history management

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
- Create rules to modify GraphQL requests in real-time
- Simulate network conditions (delays, failures, slow responses)
- Mock custom responses for testing edge cases
- Modify variables and headers dynamically
- Environment-specific rules (dev/staging/prod)

### 💾 **Developer Tools**
- Export/import rule configurations for team sharing
- Multiple logging levels (Silent to Debug)
- Clean DevTools integration
- Local data storage (no external servers)

## 📦 Installation

### Chrome Web Store
*Coming Soon - Pending Review*

### Firefox Add-ons
*Coming Soon - In Development*

### From Source (Development)

**Chrome:**
1. Download and extract the source code
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/chrome` folder

**Firefox:**
1. Download and extract the source code
2. Open `about:debugging`
3. Click "This Firefox" → "Load Temporary Add-on"
4. Select `dist/firefox/manifest.json`

## 🛠️ Quick Start

1. **Install the extension** and open DevTools (F12)
2. **Find the "GraphQL Testing" tab** in DevTools
3. **Enable monitoring** using the toggle switch
4. **Start making GraphQL requests** - they'll appear automatically

### Schema Explorer Setup
1. Go to **Schema Explorer** tab
2. **Use auto-detected endpoints** (recommended) or enter manually
3. **Configure authentication** if needed
4. **Click "Load Schema"** to explore your GraphQL API
5. **Generate and execute queries** with one click

### Visual Query Builder
1. **Load a schema** in Schema Explorer
2. **Switch to Visual Builder** tab
3. **Click the + button** next to operations to add them
4. **Configure arguments** and **select response fields**
5. **Execute queries** or copy generated GraphQL

### Rule Engine
1. Go to **Rules** tab
2. **Click "Add Rule"**
3. **Configure pattern matching** (operation name, URL)
4. **Set action** (delay, mock, modify, block)
5. **Save and enable** the rule

## 📋 Use Cases

### For Developers
- **Progressive Loading**: Test UI with delayed data loading
- **Error Handling**: Validate app behavior with failed requests
- **Performance**: Simulate slow network conditions
- **API Exploration**: Browse and test GraphQL schemas interactively

### For QA Engineers
- **Regression Testing**: Apply consistent test scenarios
- **Edge Cases**: Test with partial or missing data
- **User Experience**: Validate loading states and error messages
- **Cross-Environment**: Share test configurations across teams

## 🔧 Rule Examples

### Delay Specific Operations
```json
{
  "name": "Slow Loading Test",
  "matchType": "operationName",
  "pattern": "GetUsers",
  "action": "delay",
  "delayMs": 3000
}
```

### Mock Empty Responses
```json
{
  "name": "Empty Data Test",
  "matchType": "operationName", 
  "pattern": "GetStudentScores",
  "action": "mock",
  "mockResponse": {
    "data": { "GetStudentScores": [] }
  }
}
```

### Modify Request Variables
```json
{
  "name": "Add Test Parameters",
  "matchType": "operationName",
  "pattern": "GetUsers", 
  "action": "modify",
  "modifications": {
    "variables": { "limit": 5, "testMode": true }
  }
}
```

## 🏗️ Architecture

- **Background Script**: Rule engine and request interception
- **Content Script**: Bridge between page and extension
- **Injected Script**: GraphQL request detection in page context
- **DevTools Panel**: Main UI for all features
- **Local Storage**: Rule and preference persistence

## 🌐 Browser Support

- **Chrome**: 88+ (Manifest V3)
- **Firefox**: 88+ (Manifest V2)
- **Edge**: Chromium-based versions

## 🔒 Privacy & Security

- **Local Storage Only**: All data stays on your device
- **No External Servers**: No data transmission to third parties
- **DevTools Only**: Only active when DevTools are open
- **CSP Compliant**: Follows browser security policies
- **Bundled Libraries**: No remote code loading

## 🐛 Troubleshooting

**Extension not detecting requests?**
- Ensure requests are POST with JSON bodies containing GraphQL fields
- Refresh page after enabling extension
- Check browser console for errors

**Rules not applying?**
- Verify rule is enabled (green indicator)
- Check pattern matching (case-sensitive)
- Ensure extension is globally enabled

**DevTools tab missing?**
- Look for "GraphQL Testing" alongside Console, Network tabs
- Try disabling/re-enabling extension
- Restart browser if needed

## 📈 Roadmap

### ✅ Completed
- [x] Advanced code search within blocks
- [x] GraphQL schema exploration and introspection
- [x] Visual query builder with click-to-add interface
- [x] Smart authentication detection and management
- [x] Select All/Deselect All for response fields
- [x] Real-time query preview and execution

### 🚧 In Progress
- [ ] Chrome Web Store publication
- [ ] Firefox Add-ons store publication
- [ ] WebSocket GraphQL support

### 📋 Planned
- [ ] GraphQL subscription testing
- [ ] Performance metrics and timing analysis
- [ ] Query history and favorites
- [ ] Schema diff and versioning
- [ ] Team collaboration features
- [ ] CI/CD integration hooks

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Documentation**: This README and in-extension help

---

**Built for developers, by developers. Enhance your GraphQL workflow today! 🚀**
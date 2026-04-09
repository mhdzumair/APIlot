# APIlot

**Your AI copilot for API testing**

A powerful browser extension for **GraphQL**, **REST**, and **static asset** workflows — development, testing, and debugging. Lives in **browser DevTools** with AI-assisted mock generation, performance analytics, time-travel debugging, and a configurable rule engine.

| Firefox | Chrome |
|--------|--------|
| [**Install on Firefox Add-ons**](https://addons.mozilla.org/en-US/firefox/addon/apilot/) | [**Install on Chrome Web Store**](https://chromewebstore.google.com/detail/apilot/ljcjafognoadjggjjapomkgcoclkknhl) |

**By:** [Mohamed Zumair](https://github.com/mhdzumair) · **License:** [MIT](LICENSE) · **Privacy:** [PRIVACY.md](PRIVACY.md)

---

## Screenshots

<p align="center">
  <img src="screenshots/screenshot-1.png" alt="Monitor tab — network requests and capturing" width="780" /><br />
  <sub><b>Monitor</b> — live request list, filters, and GraphQL / REST / static detection</sub>
</p>

<p align="center">
  <img src="screenshots/screenshot-2.png" alt="Request detail — query and response" width="780" /><br />
  <sub><b>Request detail</b> — query, variables, response, and headers</sub>
</p>

<p align="center">
  <img src="screenshots/screenshot-3.png" alt="Create rule from a captured request" width="780" /><br />
  <sub><b>Rules from traffic</b> — open the rule editor prefilled from a request</sub>
</p>

<p align="center">
  <img src="screenshots/screenshot-4.png" alt="Rules tab" width="780" /><br />
  <sub><b>Rules</b> — manage mocks, delays, redirects, blocks, and more</sub>
</p>

<p align="center">
  <img src="screenshots/screenshot-5.png" alt="Analytics dashboard" width="780" /><br />
  <sub><b>Analytics</b> — timing metrics, charts, and per-endpoint rollups (export supported)</sub>
</p>

---

## Key features

### Request monitoring
- GraphQL and REST detection with **filters** (status, method, type, text search)
- **Subframes / iframes**: traffic from embedded clients is monitored when enabled
- Rich **request/response** views with in-panel search
- **Transfer size** column — populated from `Content-Length` or measured body size
- **Waterfall timeline** view — time-proportional bars per request, color-coded by type, with hover tooltips
- **HAR export** — export the current capture as a `.har` file (compatible with Chrome DevTools, Firefox, and standard HAR viewers)

### AI-assisted mocking
- Generate mocks from captured traffic via **your** API keys
- Providers: **OpenAI**, **Anthropic**, **OpenRouter**, **Azure OpenAI**, **Google Gemini**, plus a **local / pattern-based** path (no remote LLM)
- Configure models and limits under **Settings**

### Schema explorer & query builder
- **Introspection** and execution against endpoints you choose
- Auth helpers (Bearer, API keys, custom headers) and **visual query builder**

### Rule engine
- **GraphQL**, **REST**, **both**, and **static asset** (JS/CSS/images) rule types
- Actions: **mock**, **delay**, **block**, **modify**, **redirect**, **passthrough**
- URL/host patterns, GraphQL operation matching, REST path and method matching
- **Import / export** rules as JSON
- **Declarative Net Request** on Chrome MV3; **webRequest** on Firefox MV2

### Performance analytics
- Session-oriented metrics: counts, success rate, response times, charts
- **Per-endpoint** stats and **export** (JSON)
- **Filters** by request type, status class, and time window

### Time-travel debugging
- Record request/response sequences, replay with controls, edit responses mid-replay
- **Export / import** sessions

### Developer experience
- **DevTools** panel integration
- Local storage for rules and settings (AI calls go to the provider you pick)
- **ESLint** with `eslint-plugin-jsx-a11y` enforcing WCAG-compliant accessible markup
- Configurable **logging levels** (Silent → Debug)

---

## Installation

### Firefox

[Firefox Add-ons — APIlot](https://addons.mozilla.org/en-US/firefox/addon/apilot/)

### Chrome

[Chrome Web Store — APIlot](https://chromewebstore.google.com/detail/apilot/ljcjafognoadjggjjapomkgcoclkknhl)

### From source (development)

**Prerequisites:** Node.js 18+ and npm.

```bash
npm install
npm run build        # Firefox MV2 + Chrome MV3
# or: npm run build:firefox   /   npm run build:chrome
```

**Chrome (unpacked MV3):**

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select **`dist/chrome-mv3`**

**Firefox (temporary add-on):**

1. Open `about:debugging` → **This Firefox**
2. **Load Temporary Add-on** → select **`dist/firefox-mv2/manifest.json`**

```bash
npm run package      # zip both browsers for store submission
npm run lint         # ESLint + jsx-a11y
npm run typecheck    # TypeScript
```

---

## Quick start

1. Install the extension and open **DevTools** (F12).
2. Open the **APIlot** panel.
3. Turn **monitoring** on for the tab and use your app; requests appear in **Monitor**.
4. Optional: **Settings** → choose an **AI provider** and API key for mock generation.

### Rules

1. **Rules** → **Add Rule** (or use **+ Rule** on any request row).
2. Pick **rule type** (GraphQL, REST, both, or static).
3. Set **matchers** (operation name, URL pattern, method, etc.).
4. Pick **action** (mock, delay, redirect, …) and save.

### Time travel

1. **Time Travel** → **Record** → exercise your app → **Stop**.
2. **Replay**, tweak responses, or **export** the session.

---

## Rule examples

### Delay a GraphQL operation

```json
{
  "name": "Slow loading test",
  "requestType": "graphql",
  "operationName": "GetUsers",
  "action": "delay",
  "delay": 3000
}
```

### Mock a REST response

```json
{
  "name": "Mock user list",
  "requestType": "rest",
  "httpMethod": "GET",
  "urlPattern": "/api/users",
  "action": "mock",
  "statusCode": 200,
  "mockResponse": { "users": [{ "id": 1, "name": "Test User" }] }
}
```

### Simulate HTTP 500

```json
{
  "name": "Server error test",
  "requestType": "rest",
  "urlPattern": "/api/*",
  "action": "mock",
  "statusCode": 500,
  "mockResponse": { "error": "Internal Server Error" }
}
```

---

## Architecture (overview)

| Piece | Role |
|--------|------|
| **Background** | Rules, `webRequest` / DNR coordination, logging, messaging |
| **Content script** | Bridge to the page; monitoring gating |
| **Injected script** | Request observability in page context (fetch + XHR) |
| **DevTools panel** | Monitor, Rules, Analytics, Time Travel, Schema, Builder, Settings |
| **Storage** | Rules, settings, sessions (local to the browser) |

---

## Browser support

| Browser | Manifest | Status |
|---------|-----------|--------|
| **Firefox** | MV2 | **Published** on [AMO](https://addons.mozilla.org/en-US/firefox/addon/apilot/) |
| **Chrome** (and Chromium browsers) | MV3 | **Published** on [Chrome Web Store](https://chromewebstore.google.com/detail/apilot/ljcjafognoadjggjjapomkgcoclkknhl) |

---

## Privacy & security

- **Default:** rules, logs, and settings stay **on your device**; see **[PRIVACY.md](PRIVACY.md)**.
- **AI:** when enabled, prompts/data are sent to **the provider you configure** (your API keys).
- **No** bundled third-party analytics from the extension authors.

---

## Troubleshooting

**No requests in the list?**  
Enable monitoring for the tab; refresh the page; confirm the URL isn't excluded by filters.

**Rules not applying?**  
Check the rule is **enabled**, patterns match the traffic, and (Chrome static rules) DNR is synced after saves.

**AI mocks failing?**  
Verify keys and model in **Settings**; check provider quota and errors in the panel.

**DevTools tab missing?**  
Reload the extension; reopen DevTools; look for **APIlot** next to other tool tabs.

---

## Roadmap

### Done ✓

- [x] GraphQL & REST monitoring, filtering, and rich request detail
- [x] Iframe / subframe coverage for embedded API clients
- [x] Rule engine (mock, delay, block, modify, redirect, passthrough) + static-asset path
- [x] AI mock generation (multiple LLM providers + local pattern mode)
- [x] Schema explorer & visual query builder
- [x] Analytics (charts + per-endpoint rollups + export + filters)
- [x] Time-travel record / replay / export
- [x] Dual build: **Firefox MV2** + **Chrome MV3** (WXT)
- [x] **Firefox Add-ons** publication
- [x] **Chrome Web Store** publication *(v2.3.0)*
- [x] **Transfer size** column (Content-Length / body measurement)
- [x] **Waterfall timeline** view with hover tooltips and auto-scroll
- [x] **HAR export** (HAR 1.2 format)
- [x] **Accessibility** — WCAG AA color contrast + keyboard navigation (eslint-plugin-jsx-a11y)

### Planned

- [ ] **Header modification rules** — add/override/remove request headers before fetch fires
- [ ] **Partial response override** — regex find/replace on live JSON responses
- [ ] **Environment variables** — `{{VAR}}` substitution across rule fields
- [ ] **Shareable rule packs** — export/import via base64 URL or file
- [ ] **WebSocket monitoring** — capture frames in the Monitor panel
- [ ] **Server-Sent Events (SSE)** monitoring
- [ ] **HAR import** — populate the monitor from a Chrome/Firefox network export
- [ ] **Bulk mock creation** — multi-select requests and generate rules in one action
- [ ] **Performance budgets** — configurable thresholds with alerts in Analytics
- [ ] Schema diff / versioning helpers
- [ ] Query history & favorites

---

## Contributing

1. Fork the repo
2. Branch (`git checkout -b feature/your-feature`)
3. Commit and push
4. Open a **Pull Request**

---

## Support

- **Issues:** [GitHub Issues](https://github.com/mhdzumair/apilot/issues)
- **Firefox listing:** [addons.mozilla.org — APIlot](https://addons.mozilla.org/en-US/firefox/addon/apilot/)
- **Chrome listing:** [Chrome Web Store — APIlot](https://chromewebstore.google.com/detail/apilot/ljcjafognoadjggjjapomkgcoclkknhl)
- **Docs:** this README, [PRIVACY.md](PRIVACY.md), and in-extension UI

---

**APIlot** — your AI copilot for API testing. Navigate APIs with confidence.

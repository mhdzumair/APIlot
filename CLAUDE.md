# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

APIlot is a browser DevTools extension for API testing and debugging with AI-powered mock generation. It supports both Chrome (Manifest V3) and Firefox (Manifest V2).

## Build & Development Commands

```bash
# Development (with hot reload)
npm run dev            # Firefox development
npm run dev:chrome     # Chrome development

# Build
npm run build          # Both browsers
npm run build:firefox  # Firefox only
npm run build:chrome   # Chrome only

# Packaging
npm run package        # Create ZIPs for both
npm run clean          # Clean dist/ artifacts
```

No test runner is configured — `npm test` and `npm run lint` are placeholders.

**Loading the extension locally:**
- Chrome: Load unpacked from `dist/chrome/`
- Firefox: Load temporary add-on from `dist/firefox/`

## Architecture

### Dual-Browser Strategy

The same core logic runs on both browsers via adapters:
- `src/background/core.js` — shared `APITestingCore` class, browser-agnostic
- `src/background/firefox-adapter.js` — wraps `browser.*` APIs (Manifest V2, persistent background)
- `src/background/chrome-adapter.js` — wraps `chrome.*` APIs (Manifest V3, service worker)
- `src/background/service-worker.js` — Chrome entry point
- `src/background/background.js` — Firefox entry point

The build script (`build/build.js`) copies common files to both `dist/firefox/` and `dist/chrome/`, then applies the appropriate manifest and strips browser-specific files.

### Request Interception Flow

```
Page (fetch/XHR)
  → src/content/injected-script.js   (injected at document_start, intercepts native APIs)
  → src/content/content-script.js    (bridge via postMessage)
  → Background core.js               (applies rules, captures to tab state)
  → DevTools panel.js                (receives via chrome.runtime messaging)
```

### Key Components

| File | Class | Role |
|------|-------|------|
| `src/background/core.js` | `APITestingCore` | Central hub: rules, tab state, settings, message routing |
| `src/devtools/panel.js` | `GraphQLTestingPanel` | Main UI: request log, rules editor, schema explorer, query builder |
| `src/services/ai-mock-service.js` | `AIMockService` | AI mock generation (OpenAI, Anthropic, Azure, Gemini, OpenRouter, Local) |
| `src/services/performance-tracker.js` | `PerformanceTracker` | Request timing, success/error aggregation (max 1000 entries) |
| `src/services/session-recorder.js` | `SessionRecorder` | Time-travel debugging: record, playback, export/import |
| `src/shared/apilot-rule-match.js` | `ApilotRuleMatch` | Rule matching engine shared between panel and background |

### Shared Rule Engine

`src/shared/apilot-rule-match.js` is intentionally used by both the DevTools panel and the background script to ensure consistent rule evaluation. Changes here affect both sides simultaneously.

### Bundled Libraries

`src/libs/` contains vendored minified builds of highlight.js, Chart.js, graphql-js, and a JSON formatter — no npm install needed for these.

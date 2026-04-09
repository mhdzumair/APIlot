# APIlot — Privacy Policy

**Last updated:** April 7, 2026  

**Developer:** Mohamed Zumair — [mhdzumair@gmail.com](mailto:mhdzumair@gmail.com)

This policy describes how the **APIlot** browser extension (“the Extension”) handles information. APIlot is a **developer tool** for inspecting HTTP/HTTPS traffic, testing APIs, and optional AI-assisted mocking. It is not intended for general consumer browsing or children’s use.

## Summary

- The Extension **does not sell** your data or use it for advertising.
- **Request logs, rules, and most settings stay on your device** in browser extension storage.
- **Optional AI features** send content you choose (e.g. request/response context) to the **third-party AI provider you select**, using **your** API credentials when required.
- The Extension **does not include** built-in analytics or crash-reporting services that send usage data to the Extension authors.

If you do not use optional AI or remote schema features against external endpoints, typical use is limited to local processing and storage in your browser.

## Information the Extension Processes

### 1. Network and API data (local debugging)

When you enable monitoring or rules for a tab, the Extension may observe **URLs, methods, headers, bodies, timing, and related metadata** for requests the browser makes—similar in scope to built-in developer tools. This is used **only** to power features such as the request log, GraphQL labeling, rules matching, and in-panel analytics summaries.

That data is **processed locally** in the Extension and is **not transmitted to the Extension authors** as part of normal operation.

### 2. Data stored on your device

The Extension uses the browser’s **storage** APIs to persist items such as:

- Your **rules** (mock, redirect, delay, block, etc.) and related configuration  
- **Settings** (e.g. provider preferences, model choices, toggles)  
- **API keys or tokens** you enter for optional integrations (stored like other settings—**protect your profile/device**)  
- **Cached or exported data** you generate while using the Extension (e.g. exported JSON)

You can remove much of this data by clearing Extension storage or uninstalling the Extension (subject to browser behavior).

### 3. Optional AI-assisted mocking

If you enable **AI mock generation** (or similar features) and configure a provider (e.g. OpenAI, Anthropic, OpenRouter, Azure, Gemini, or a local/pattern-based mode as offered in the product):

- The Extension may send **prompts** that can include **request/response excerpts, GraphQL queries, URLs, or other context** needed to generate mocks.  
- That traffic goes **directly to the provider’s servers** (or stays local if you use an offline/local mode), under **that provider’s** terms and privacy policy—not a separate “APIlot” backend operated by the Extension authors.  
- **API keys** you supply are used from your browser to authenticate with those providers.

**You should not enable AI features with sensitive production secrets** unless you accept the risk of sending that content to the chosen provider.

### 4. User-directed requests to your APIs

Features such as **GraphQL introspection** or **query execution** send requests **only to endpoints you specify** (for example your own GraphQL URL). Those requests are **initiated by you** for development and testing.

## Permissions (high level)

Broad host access and network-related permissions exist so the Extension can observe and optionally modify traffic **for development**, including APIs and static assets on **arbitrary hosts** you visit while debugging—without hard-coding a fixed list of domains. This does not change the fact that the Extension authors do not receive that traffic by default.

## Third-party services

- **AI providers:** Subject to **their** policies when you opt in and use your keys.  
- **Websites you open:** The Extension does not add hidden trackers to pages you browse for advertising.

## Data retention

Data persists **until you delete it** or **remove the Extension**, depending on your browser. The Extension authors do not operate a central account system for normal use of the product.

## Children’s privacy

APIlot is aimed at **developers and technical users**. It is **not directed at children under 13** (or the minimum age in your jurisdiction), and we do not knowingly collect personal information from children.

## Changes

We may update this policy when the Extension’s behavior or store requirements change. The **“Last updated”** date at the top will reflect revisions material to privacy.

## Contact

**Mohamed Zumair**  
Email: [mhdzumair@gmail.com](mailto:mhdzumair@gmail.com)

For privacy questions or requests regarding this policy or the Extension listing, you may also use the support or contact options on the extension’s store page (e.g. Firefox Add-ons / Chrome Web Store).

---

*This document is provided for transparency and store submissions. It is not legal advice.*

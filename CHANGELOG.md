# Changelog

All notable changes to **APIlot** are documented in this file. It also includes the **GraphQL Testing Toolkit** release history—the predecessor extension whose codebase led to APIlot (`graphql-testing-toolkit/`).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.3.0] — 2026-04-09

### Added

- **Monitor — waterfall view** — Timeline-style visualization of captured requests for quicker scanning of ordering and duration.
- **HAR export** — Export the current session’s captured traffic as **HAR 1.2** from the Monitor tab (compatible with common analysis tools).
- **ESLint** — `eslint.config.js` with React and accessibility-oriented rules.

### Changed

- **Monitor / schema / requests** — Filter and request UI polish; request detail tweaks; schema viewer accessibility improvements; minor background and icon behavior alignment with monitoring state.

### Dependencies

- Routine dependency updates with the ESLint and tooling work (see `package.json` / lockfile).

---

## [2.2.1] — 2026-04-09

### Added

- **Privacy policy** — `PRIVACY.md` for listings and transparency.
- **Documentation** — README overhaul: Firefox Add-ons link, install paths (`dist/chrome-mv3`, `dist/firefox-mv2`), screenshots (`screenshots/`), roadmap refresh.
- **Playwright** — `scripts/playwright-with-apilot.mjs` and `yarn playwright:extension` for automated runs with the unpacked extension (see `.gitignore` profile).

### Changed

- **Rules — delete** — Confirmation via an **in-panel dialog** (avoids broken `window.confirm` in DevTools); improved `DELETE_RULE` handling and error feedback.
- **Rules — naming** — **Auto-generated default titles** from rule type and action when creating a rule, until the user edits the name.
- **Rule cards** — Explicit `type="button"` on actions to avoid accidental form submits.

---

## [2.2.0] — 2026-04-09

### Added

- **Analytics** — Filters on the analytics dashboard for easier drill-down.
- **Performance** — Accumulated / per-endpoint performance metrics (page profiling style) with export support in analytics workflows.
- **Cross-frame monitoring** — Background messaging extended so subframes/iframes are better covered alongside the main frame; content script coordination updates.
- **GraphQL + webRequest** — Deduplication and labeling improvements when both injected and `webRequest` paths see the same traffic (Firefox / MV2).

### Changed

- **API interception & UI** — Iterative improvements to request handling, monitor UI, and related components (GraphQL core, request list, panel).

---

## [2.1.0] — 2026-03-31

### Added

- **WXT + modern stack** — Migrated the extension to [WXT](https://wxt.dev/), **React 18**, **TypeScript**, **Tailwind CSS v4**, **shadcn/ui**, and **Zustand** (replacing the legacy scaffold while preserving behavior).
- **Build** — Phase 0 WXT scaffold, then full migration to the new pipeline and `src/` layout.

### Changed

- **Chrome & Firefox adapters** — Network capture settings, tab state handling, and clearer behavior across MV3 (Chrome) and MV2 (Firefox).
- **Rule matching** — Shared rule-matching module for consistent GraphQL/REST/static behavior end-to-end.

---

## [2.0.0] — 2026-01-22

### Added

- **Rebrand to APIlot** — GraphQL **and** REST support in one DevTools-oriented workflow.
- **AI mock generation** — Multiple provider hooks and local/pattern flows for generating mocks from traffic/schema context.
- **Performance tracking** — In-panel metrics and analytics-oriented views.
- **Time travel / sessions** — Record and replay API-oriented sequences for debugging.
- **Analytics dashboard** — Response-time views and summaries for the current session.
- **Branding** — Updated icons and README for the new product name.

### Changed

- **Response & builder UI** — Search and copy in response panels; keyboard shortcuts and focus handling; expanded request detail state across re-renders (commits leading up to 2.1.0 work).

### Other

- **License** — MIT (`LICENSE`).
- **Manifest** — Data collection / permissions disclosure updates for store requirements.
- **Packaging** — Build output / zip naming adjustments.

---

## [1.0.0] — 2025-12-01 (APIlot repository)

- First commits **in this repository**: continuation of the GraphQL-focused work, as a starting point before the **APIlot** rebrand and REST-wide features (`059b0f0`).

---

## GraphQL Testing Toolkit (predecessor)

These versions shipped from the standalone **`graphql-testing-toolkit`** project (same feature lineage as early GraphQL-only DevTools work). Extension version comes from **`manifest.json`** / **`manifest-v3.json`**.

### [1.1.0] — 2025-09-18

- Bumped extension manifests to **1.1.0** (Firefox MV2 and Chrome MV3).

### [1.0.1] — 2025-09-11

- **README** — Installation and usage documentation refined.
- **Request handling & UI** — Improved capture/display pipeline and panel updates.
- **DevTools panel** — Unified filtering, layout refinements, and further UI/behavior improvements.

### [1.0.0] — 2025-08-29 … 2025-09-08

- **Initial release** — Firefox-oriented extension: manifest, background script, content script, DevTools panel entry, core UI, icons, dev helper script, and README.
- **Theming** — Theme support in the DevTools panel.
- **Rules** — Rule notifications and multiple-rule handling.
- **Icons** — Updated icon set.
- **Chrome / MV3** — Manifest V3 build path and dual build for Firefox + Chrome.
- **Schema Explorer** — Interactive schema exploration.
- **Advanced code search** — Search within request/query content in the panel.

---

**Full history (APIlot):** [github.com/mhdzumair/APIlot/commits/main](https://github.com/mhdzumair/APIlot/commits/main)

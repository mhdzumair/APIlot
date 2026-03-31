/**
 * Thin re-export of webextension-polyfill.
 * Import from here everywhere in src/ instead of directly from the polyfill.
 */
export { default as browser } from 'webextension-polyfill';
export type { Browser } from 'webextension-polyfill';

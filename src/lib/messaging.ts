/**
 * Typed wrappers for runtime.sendMessage used throughout the extension.
 * All panel → background and background → content messages go through here.
 */

import { browser } from './browser';
import type {
  PanelToBackgroundMessage,
  BackgroundToContentMessage,
  MessageResponses,
} from '../types/messages';

/**
 * Send a typed message from the panel / DevTools page to the background script.
 * Returns the typed response for the given message type.
 */
export async function sendMsg<T extends PanelToBackgroundMessage['type']>(
  message: Extract<PanelToBackgroundMessage, { type: T }>
): Promise<MessageResponses[T]> {
  return browser.runtime.sendMessage(message) as Promise<MessageResponses[T]>;
}

/**
 * Send a typed message from the background script to a specific content script tab.
 */
export async function sendMsgToTab<T extends BackgroundToContentMessage['type']>(
  tabId: number,
  message: Extract<BackgroundToContentMessage, { type: T }>
): Promise<void> {
  return browser.tabs.sendMessage(tabId, message) as Promise<void>;
}

/**
 * Deliver a runtime message to every frame in a tab that can host our content script.
 * tabs.sendMessage(tabId, msg) alone only reaches the main frame; iframes miss START_/STOP_MONITORING.
 */
import { browser } from '../lib/browser';

type FrameDetail = { frameId: number; errorOccurred?: boolean };

function getWebNavigation():
  | { getAllFrames: (o: { tabId: number }) => Promise<FrameDetail[]> }
  | undefined {
  if (typeof chrome !== 'undefined' && chrome.webNavigation?.getAllFrames) {
    return chrome.webNavigation;
  }
  const bw = browser as unknown as {
    webNavigation?: { getAllFrames: (o: { tabId: number }) => Promise<FrameDetail[]> };
  };
  return bw.webNavigation;
}

async function sendToFrame(
  tabId: number,
  message: { type: string; data?: unknown },
  frameId: number,
): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
      await chrome.tabs.sendMessage(tabId, message, { frameId });
    } else {
      await browser.tabs.sendMessage(tabId, message, { frameId });
    }
  } catch {
    /* Frame has no listener (chrome://, PDF, etc.) */
  }
}

export async function broadcastTabMessage(
  tabId: number,
  message: { type: string; data?: unknown },
): Promise<void> {
  const wn = getWebNavigation();
  if (!wn?.getAllFrames) {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        await chrome.tabs.sendMessage(tabId, message);
      } else {
        await browser.tabs.sendMessage(tabId, message);
      }
    } catch {
      /* tab closed or no receiver */
    }
    return;
  }

  let frames: FrameDetail[];
  try {
    frames = (await wn.getAllFrames({ tabId })) ?? [];
  } catch {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        await chrome.tabs.sendMessage(tabId, message);
      } else {
        await browser.tabs.sendMessage(tabId, message);
      }
    } catch {
      /* ignore */
    }
    return;
  }

  if (frames.length === 0) {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        await chrome.tabs.sendMessage(tabId, message);
      } else {
        await browser.tabs.sendMessage(tabId, message);
      }
    } catch {
      /* ignore */
    }
    return;
  }

  await Promise.all(
    frames.filter((f) => !f.errorOccurred).map((f) => sendToFrame(tabId, message, f.frameId)),
  );
}

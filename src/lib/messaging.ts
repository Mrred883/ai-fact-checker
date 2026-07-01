import type { Verdict } from './types'

/** Status of the live-audio listening session. */
export interface ListenState {
  listening: boolean
  tabId?: number
  /** live interim (not-yet-final) transcript */
  partial?: string
  /** rolling text of what's been heard (finals), shown in the popup */
  heard?: string
  /** human-readable stage: "Listening", "Checking…", "Added 2 verdicts", … */
  status?: string
  error?: string
}

export type Msg =
  // popup/content -> background : fact-check a block of text
  | { type: 'FACTCHECK_TEXT'; text: string; source: 'selection' | 'article'; pageUrl?: string }
  // popup -> background : persist + broadcast verdicts the popup already produced (e.g. asset checks)
  | { type: 'DELIVER_VERDICTS'; verdicts: Verdict[] }
  // background -> content/popup : new verdicts ready
  | { type: 'VERDICTS'; verdicts: Verdict[]; source: Verdict['source'] }
  // background -> popup : a text check is in progress (show a live placeholder)
  | { type: 'CHECKING'; on: boolean; source: Verdict['source'] }
  // popup -> background : control live audio
  | { type: 'AUDIO_START'; tabId: number }
  | { type: 'AUDIO_STOP' }
  // offscreen -> background : recognised speech
  | { type: 'TRANSCRIPT'; text: string; final: boolean }
  // offscreen -> background : recognizer error (mic blocked, unsupported, …)
  | { type: 'AUDIO_ERROR'; error: string }
  // offscreen -> background : recognizer lifecycle status ("Microphone live", "Hearing speech…", …)
  | { type: 'AUDIO_STATUS'; status: string }
  // background -> offscreen : start capturing a tab's audio and transcribing it
  | { type: 'OFFSCREEN_START'; lang: string; streamId: string; deepgramKey: string }
  | { type: 'OFFSCREEN_STOP' }
  // offscreen -> background : recognizer script loaded and listening for commands
  | { type: 'OFFSCREEN_READY' }
  // background -> popup : listen state changed
  | { type: 'STATE'; state: ListenState }
  // popup -> background : ask for current state
  | { type: 'STATE_QUERY' }
  // content -> background : may I auto-scan this page? (key never leaves background)
  | { type: 'AUTOSCAN_QUERY' }
  // popup -> background : inject the selection toolbar into the active tab
  | { type: 'ARM_TAB'; tabId: number }
  // popup -> background : is this tab already armed for highlight-to-check?
  | { type: 'ARM_QUERY'; tabId: number }
  // popup -> content : toggle the on-page "scanning" animation
  | { type: 'SCAN_FX'; on: boolean }
  // content -> background : begin selection fact-check (from selection toolbar)
  | { type: 'PING' }

export type MsgResponse =
  | { ok: true; verdicts?: Verdict[]; state?: ListenState; autoScan?: boolean; checking?: boolean; armed?: boolean }
  | { ok: false; error: string }

/** True only when the extension context is still alive (false after a reload/update). */
export function contextAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

/** Promise wrapper around chrome.runtime.sendMessage. Never throws/rejects. */
export function send(msg: Msg): Promise<MsgResponse> {
  return new Promise((resolve) => {
    if (!contextAlive()) {
      resolve({ ok: false, error: 'Extension was reloaded. Refresh this page to continue.' })
      return
    }
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'sendMessage failed' })
        } else {
          resolve(res ?? { ok: false, error: 'no response' })
        }
      })
    } catch (e) {
      // synchronous throw, e.g. "Extension context invalidated"
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}

export function sendToTab(tabId: number, msg: Msg): Promise<MsgResponse> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'tab closed' })
        } else {
          resolve(res ?? { ok: true })
        }
      })
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}

export function onMessage(
  handler: (msg: Msg, sender: chrome.runtime.MessageSender) => Promise<MsgResponse> | MsgResponse | void,
) {
  chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
    const result = handler(msg, sender)
    if (result instanceof Promise) {
      result.then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }))
      return true // keep channel open for async response
    }
    if (result !== undefined) sendResponse(result)
    return false
  })
}

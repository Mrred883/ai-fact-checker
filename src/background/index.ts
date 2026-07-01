import { onMessage, type ListenState, type Msg, type MsgResponse } from '@/lib/messaging'
import { factCheckText, factCheckTextStream } from '@/lib/factcheck'
import { getSettings, addToHistory } from '@/lib/storage'
import type { Verdict } from '@/lib/types'

const CONTEXT_MENU_ID = 'veritas-factcheck-selection'
const OFFSCREEN_URL = 'src/offscreen/offscreen.html'

const state: ListenState = { listening: false }

// ── lifecycle ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Fact-check “%s” with AI Fact Checker',
    contexts: ['selection'],
  })
})

// ── broadcast helpers ────────────────────────────────────────────────────────
function broadcastRuntime(msg: Msg) {
  // popup / options - ignore "no receiver" errors
  chrome.runtime.sendMessage(msg).catch(() => {})
}

function pushToTab(tabId: number | undefined, msg: Msg) {
  if (tabId == null) return
  chrome.tabs.sendMessage(tabId, msg).catch(() => {})
}

function setState(patch: Partial<ListenState>) {
  Object.assign(state, patch)
  broadcastRuntime({ type: 'STATE', state: { ...state } })
}

// number of verdicts the user hasn't seen in the popup yet (badge count)
let unseen = 0
// how many text checks are in flight — so a freshly-opened popup can show the
// "Checking…" placeholder even though the check started before it opened
let checksInFlight = 0

/**
 * Flag unread results with a toolbar badge. We deliberately do NOT force-open a
 * popup: if the user has the extension pinned and open, results stream into it
 * live; if not, the badge is the cue to click. Force-opening a second popup was
 * confusing, so it was removed.
 */
async function openExtensionUi(count: number) {
  unseen += count
  try {
    await chrome.action.setBadgeText({ text: unseen > 99 ? '99+' : String(unseen) })
    chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' })
  } catch {
    /* ignore */
  }
}

function clearUnseen() {
  unseen = 0
  chrome.action.setBadgeText({ text: '' }).catch(() => {})
}

async function deliverVerdicts(verdicts: Verdict[], tabId?: number) {
  if (!verdicts.length) return
  await addToHistory(verdicts)
  const source = verdicts[0].source
  broadcastRuntime({ type: 'VERDICTS', verdicts, source })
  pushToTab(tabId, { type: 'VERDICTS', verdicts, source })
  // text checks (selection / article / context-menu) surface in the extension UI;
  // live audio stays quiet so the popup doesn't keep reopening.
  if (source !== 'audio') void openExtensionUi(verdicts.length)
}

/** Broadcast a single verdict as a live preview (no persist — final pass stores). */
function previewVerdict(v: Verdict, tabId?: number) {
  broadcastRuntime({ type: 'VERDICTS', verdicts: [v], source: v.source })
  pushToTab(tabId, { type: 'VERDICTS', verdicts: [v], source: v.source })
}

// ── offscreen document (live-audio recognizer) ───────────────────────────────
async function hasOffscreen(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  })
  return contexts.length > 0
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
    justification: 'Run Web Speech recognition on microphone audio for live fact-checking.',
  })
}

async function closeOffscreen() {
  if (await hasOffscreen()) await chrome.offscreen.closeDocument()
}

// ── live-audio transcript buffering ──────────────────────────────────────────
let transcriptBuffer = '' // finals waiting to be checked
let heardRolling = '' // last bit of speech, shown in the popup
let checking = false
let flushTimer: ReturnType<typeof setTimeout> | null = null

const FLUSH_CHARS = 110 // a long-enough run gets checked immediately
const MIN_SEGMENT = 24 // ignore tiny fragments
const FLUSH_IDLE_MS = 2200 // …otherwise check after a short pause in speech
const AUDIO_MAX_SEARCHES = 3 // cap searches on live audio for low latency

function clearFlushTimer() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

function scheduleFlush() {
  clearFlushTimer()
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushNow()
  }, FLUSH_IDLE_MS)
}

// Speech transcripts have no punctuation, so we can't wait for sentence ends:
// flush on a length threshold or after a brief idle gap, whichever comes first.
async function flushNow() {
  if (checking || !state.listening) return
  const segment = transcriptBuffer.trim()
  if (segment.length < MIN_SEGMENT) return
  transcriptBuffer = ''
  clearFlushTimer()
  checking = true
  setState({ status: 'Checking…' })
  try {
    const settings = await getSettings()
    const { verdicts } = await factCheckTextStream(
      segment,
      'audio',
      settings,
      (v) => previewVerdict(v, state.tabId), // show each audio verdict live
      { maxSearches: Math.min(settings.maxSearches, AUDIO_MAX_SEARCHES) },
    )
    await deliverVerdicts(verdicts, state.tabId)
    setState({
      status: verdicts.length
        ? `Added ${verdicts.length} verdict${verdicts.length > 1 ? 's' : ''}`
        : 'No checkable claim in that bit',
    })
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : String(e), status: 'Listening' })
  } finally {
    checking = false
  }
}

function onFinalTranscript(text: string) {
  const t = text.trim()
  if (!t) return
  transcriptBuffer += (transcriptBuffer ? ' ' : '') + t
  heardRolling = (heardRolling ? heardRolling + ' ' : '') + t
  if (heardRolling.length > 240) heardRolling = heardRolling.slice(-240)
  setState({ partial: '', heard: heardRolling })
  if (transcriptBuffer.length >= FLUSH_CHARS) void flushNow()
  else scheduleFlush()
}

// ── audio control ─────────────────────────────────────────────────────────────

/** Mint a fresh tab-audio stream id and hand it (plus the Deepgram key) to the offscreen doc. */
async function sendStartToOffscreen(tabId: number) {
  const settings = await getSettings()
  const streamId = (await (
    chrome.tabCapture.getMediaStreamId as unknown as (
      o: { targetTabId: number },
    ) => Promise<string>
  )({ targetTabId: tabId })) as string
  broadcastRuntime({
    type: 'OFFSCREEN_START',
    lang: settings.lang,
    streamId,
    deepgramKey: settings.deepgramKey,
  })
}

async function startAudio(tabId: number) {
  const settings = await getSettings()
  if (!settings.apiKey) throw new Error('Add your Claude API key in settings first.')
  if (!settings.deepgramKey)
    throw new Error('Add your Deepgram key in settings to transcribe tab audio.')
  await ensureOffscreen()
  transcriptBuffer = ''
  heardRolling = ''
  clearFlushTimer()
  setState({ listening: true, tabId, partial: '', heard: '', status: 'Starting…', error: undefined })
  await sendStartToOffscreen(tabId)
}

async function stopAudio() {
  broadcastRuntime({ type: 'OFFSCREEN_STOP' })
  clearFlushTimer()
  transcriptBuffer = ''
  heardRolling = ''
  setState({ listening: false, partial: '', heard: '', status: undefined })
  await closeOffscreen()
}

// ── context menu ─────────────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) return
  try {
    const settings = await getSettings()
    if (!settings.apiKey) {
      pushToTab(tab?.id, { type: 'STATE', state: { listening: false, error: 'Add your Claude API key in settings.' } })
      chrome.runtime.openOptionsPage()
      return
    }
    const { verdicts } = await factCheckText(info.selectionText, 'selection', settings, {
      pageUrl: tab?.url,
    })
    await deliverVerdicts(verdicts, tab?.id)
  } catch (e) {
    pushToTab(tab?.id, {
      type: 'STATE',
      state: { listening: false, error: e instanceof Error ? e.message : String(e) },
    })
  }
})

// ── message router ───────────────────────────────────────────────────────────
onMessage(async (msg, sender): Promise<MsgResponse> => {
  switch (msg.type) {
    case 'STATE_QUERY':
      // popup just opened — clear the unread badge, and tell it if a check is
      // already running so it can show the placeholder right away
      clearUnseen()
      return { ok: true, state: { ...state }, checking: checksInFlight > 0 }

    case 'AUTOSCAN_QUERY': {
      // answer the content script with a boolean only — the API key stays here,
      // never crossing into the page-injected content world
      const s = await getSettings()
      return { ok: true, autoScan: Boolean(s.autoScan && s.apiKey) }
    }


    case 'AUDIO_START':
      try {
        await startAudio(msg.tabId)
        return { ok: true, state: { ...state } }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        setState({ listening: false, error })
        return { ok: false, error }
      }

    case 'AUDIO_STOP':
      await stopAudio()
      return { ok: true, state: { ...state } }

    case 'OFFSCREEN_READY':
      // offscreen just (re)loaded - if we're meant to be listening, (re)start capture
      if (state.listening && state.tabId != null) {
        try {
          await sendStartToOffscreen(state.tabId)
        } catch (e) {
          setState({ error: e instanceof Error ? e.message : String(e) })
        }
      }
      return { ok: true }

    case 'AUDIO_ERROR':
      setState({ error: msg.error })
      return { ok: true }

    case 'AUDIO_STATUS':
      setState({ status: msg.status, error: undefined })
      return { ok: true }

    case 'TRANSCRIPT':
      if (msg.final) onFinalTranscript(msg.text)
      else setState({ partial: msg.text })
      return { ok: true }

    case 'DELIVER_VERDICTS':
      // popup ran the check itself (e.g. uploaded assets) — just persist + fan out.
      // already in the popup, so don't re-open the UI; badge would be noise.
      if (msg.verdicts.length) {
        await addToHistory(msg.verdicts)
        broadcastRuntime({ type: 'VERDICTS', verdicts: msg.verdicts, source: msg.verdicts[0].source })
      }
      return { ok: true }

    case 'FACTCHECK_TEXT': {
      try {
        const settings = await getSettings()
        if (!settings.apiKey) return { ok: false, error: 'Add your Claude API key in settings first.' }
        const tabId = sender.tab?.id
        // Open the UI and show a live "checking" placeholder IMMEDIATELY, before
        // the model has produced anything. web_search runs before any output, so
        // without this the popup would look frozen for several seconds.
        void openExtensionUi(0)
        checksInFlight++
        broadcastRuntime({ type: 'CHECKING', on: true, source: msg.source })
        try {
          const { verdicts } = await factCheckTextStream(
            msg.text,
            msg.source,
            settings,
            (v) => previewVerdict(v, tabId),
            { pageUrl: msg.pageUrl },
          )
          await deliverVerdicts(verdicts, tabId)
          return { ok: true, verdicts }
        } finally {
          checksInFlight = Math.max(0, checksInFlight - 1)
          broadcastRuntime({ type: 'CHECKING', on: checksInFlight > 0, source: msg.source })
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }

    default:
      return { ok: true }
  }
})

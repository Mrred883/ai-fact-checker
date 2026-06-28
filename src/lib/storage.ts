import {
  DEFAULT_SETTINGS,
  type Asset,
  type SentimentReport,
  type Settings,
  type Verdict,
} from './types'

const SETTINGS_KEY = 'veritas:settings'
const HISTORY_KEY = 'veritas:history'
const ASSETS_KEY = 'veritas:assets'
const SENTIMENT_KEY = 'veritas:sentiment'
const HISTORY_LIMIT = 200
const ASSETS_LIMIT = 12
const SENTIMENT_LIMIT = 50

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(raw[SETTINGS_KEY] ?? {}) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await chrome.storage.local.set({ [SETTINGS_KEY]: next })
  return next
}

export async function getHistory(): Promise<Verdict[]> {
  const raw = await chrome.storage.local.get(HISTORY_KEY)
  return (raw[HISTORY_KEY] as Verdict[]) ?? []
}

export async function addToHistory(verdicts: Verdict[]): Promise<void> {
  const current = await getHistory()
  const merged = [...verdicts, ...current].slice(0, HISTORY_LIMIT)
  await chrome.storage.local.set({ [HISTORY_KEY]: merged })
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] })
}

// ── uploaded assets ──────────────────────────────────────────────────────────
export async function getAssets(): Promise<Asset[]> {
  const raw = await chrome.storage.local.get(ASSETS_KEY)
  return (raw[ASSETS_KEY] as Asset[]) ?? []
}

export async function saveAssets(assets: Asset[]): Promise<Asset[]> {
  const next = assets.slice(0, ASSETS_LIMIT)
  await chrome.storage.local.set({ [ASSETS_KEY]: next })
  return next
}

export async function clearAssets(): Promise<void> {
  await chrome.storage.local.set({ [ASSETS_KEY]: [] })
}

// ── sentiment reports ────────────────────────────────────────────────────────
export async function getSentiment(): Promise<SentimentReport[]> {
  const raw = await chrome.storage.local.get(SENTIMENT_KEY)
  return (raw[SENTIMENT_KEY] as SentimentReport[]) ?? []
}

export async function addSentiment(report: SentimentReport): Promise<SentimentReport[]> {
  const current = await getSentiment()
  const merged = [report, ...current].slice(0, SENTIMENT_LIMIT)
  await chrome.storage.local.set({ [SENTIMENT_KEY]: merged })
  return merged
}

export async function clearSentiment(): Promise<void> {
  await chrome.storage.local.set({ [SENTIMENT_KEY]: [] })
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && changes[SETTINGS_KEY]) {
      cb({ ...DEFAULT_SETTINGS, ...changes[SETTINGS_KEY].newValue })
    }
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}

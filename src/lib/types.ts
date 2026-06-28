export type VerdictLabel =
  | 'TRUE'
  | 'SUBSTANTIALLY_TRUE'
  | 'MISLEADING'
  | 'FALSE'
  | 'UNVERIFIABLE'

export interface Citation {
  title: string
  url: string
}

export interface Verdict {
  id: string
  claim: string
  speaker?: string
  verdict: VerdictLabel
  /** 0..1 model self-reported confidence */
  confidence: number
  explanation: string
  /** for FALSE/MISLEADING claims: the accurate information that sets the record straight */
  correction?: string
  citations: Citation[]
  /** epoch ms, stamped by the caller (never inside workflow-pure code) */
  createdAt: number
  /** where it came from */
  source: 'selection' | 'article' | 'audio' | 'asset'
  pageUrl?: string
}

/** an uploaded file the user can fact-check or ask about */
export interface Asset {
  id: string
  name: string
  /** mime type, e.g. application/pdf, image/png, text/plain */
  mediaType: string
  /** broad kind for handling + UI */
  kind: 'image' | 'document' | 'text'
  size: number
  /** base64 (image/pdf) — no data: prefix; absent for plain text */
  data?: string
  /** decoded text content (text/markdown assets) */
  text?: string
  createdAt: number
}

// ── AI-origin detection ──────────────────────────────────────────────────────

export type OriginBand =
  | 'LIKELY_HUMAN'
  | 'LEANS_HUMAN'
  | 'UNCERTAIN'
  | 'LEANS_AI'
  | 'LIKELY_AI'

/** one observable tell the model reasoned from, and which way it points */
export interface OriginSignal {
  label: string
  /** which origin the signal points toward */
  points: 'ai' | 'human' | 'neutral'
}

/** verifiable C2PA Content Credentials read from an image file */
export interface Provenance {
  /** the file carries a C2PA manifest */
  hasCredentials: boolean
  /** the credentials assert the content is AI-generated */
  claimsAi: boolean
  /** software/agent that made it, e.g. "Adobe Firefly" */
  generator?: string
  /** signer common name */
  issuer?: string
  /** the IPTC digitalSourceType, the strongest tell */
  sourceType?: string
  /** camera make/model from EXIF — points toward a real capture */
  camera?: string
}

export interface OriginReport {
  id: string
  /** label/name of what was checked */
  name: string
  /** what kind of content was assessed */
  medium: 'image' | 'text'
  /** verifiable provenance, when present — outranks the heuristic read */
  provenance?: Provenance
  band: OriginBand
  /** 0 = clearly human-made, 1 = clearly AI-generated */
  aiLikelihood: number
  /** the model's calibrated certainty in that read, 0..1 */
  confidence: number
  /** observable tells, both directions */
  signals: OriginSignal[]
  /** 1-3 sentence plain rationale */
  rationale: string
  createdAt: number
}

// ── sentiment analysis ───────────────────────────────────────────────────────

export type SentimentLabel =
  | 'VERY_NEGATIVE'
  | 'NEGATIVE'
  | 'MIXED'
  | 'NEUTRAL'
  | 'POSITIVE'
  | 'VERY_POSITIVE'

export interface SentimentTheme {
  /** short phrase, e.g. "praises responsiveness" */
  label: string
  /** how the crowd feels on this theme */
  tone: 'positive' | 'negative' | 'neutral'
  /** rough share of comments touching it, 0..1 */
  weight: number
}

export interface SentimentQuote {
  text: string
  tone: 'positive' | 'negative' | 'neutral'
}

export interface SentimentReport {
  id: string
  /** what/who the comments are about (user-supplied or inferred) */
  subject?: string
  overall: SentimentLabel
  /** net sentiment, -1 (hostile) .. +1 (glowing) */
  score: number
  /** share of items, each 0..1, should ~sum to 1 */
  positive: number
  negative: number
  neutral: number
  /** number of distinct comments/items the model counted */
  sampleSize: number
  summary: string
  themes: SentimentTheme[]
  quotes: SentimentQuote[]
  /** true if notable harassment / toxicity present */
  toxicity: boolean
  createdAt: number
}

export type ClaudeModel =
  | 'claude-opus-4-8'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001'

export interface Settings {
  apiKey: string
  /** Deepgram API key — transcribes captured tab audio for live fact-checking */
  deepgramKey: string
  model: ClaudeModel
  /** how aggressively to flag claims: more = checks borderline claims too */
  sensitivity: 'conservative' | 'balanced' | 'aggressive'
  /** max web_search tool uses per claim batch */
  maxSearches: number
  /** show the floating overlay on pages */
  overlayEnabled: boolean
  /** auto-scan article text on page load */
  autoScan: boolean
  theme: 'system' | 'light' | 'dark'
  /** preferred recognition language for live audio */
  lang: string
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  deepgramKey: '',
  model: 'claude-sonnet-4-6',
  sensitivity: 'balanced',
  maxSearches: 3,
  overlayEnabled: true,
  autoScan: false,
  theme: 'system',
  lang: 'en-US',
}

export const VERDICT_META: Record<
  VerdictLabel,
  { label: string; color: string; bg: string; ring: string }
> = {
  TRUE: {
    label: 'True',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/30',
  },
  SUBSTANTIALLY_TRUE: {
    label: 'Mostly True',
    color: 'text-teal-600 dark:text-teal-400',
    bg: 'bg-teal-500/10',
    ring: 'ring-teal-500/30',
  },
  MISLEADING: {
    label: 'Misleading',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    ring: 'ring-amber-500/30',
  },
  FALSE: {
    label: 'False',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10',
    ring: 'ring-red-500/30',
  },
  UNVERIFIABLE: {
    label: 'Unverifiable',
    color: 'text-slate-500 dark:text-slate-400',
    bg: 'bg-slate-500/10',
    ring: 'ring-slate-500/30',
  },
}

/** label + axis position (0 hostile → 100 glowing) for the sentiment gauge */
export const SENTIMENT_META: Record<SentimentLabel, { label: string; pos: number }> = {
  VERY_NEGATIVE: { label: 'Very Negative', pos: 6 },
  NEGATIVE: { label: 'Negative', pos: 26 },
  MIXED: { label: 'Mixed', pos: 50 },
  NEUTRAL: { label: 'Neutral', pos: 50 },
  POSITIVE: { label: 'Positive', pos: 74 },
  VERY_POSITIVE: { label: 'Very Positive', pos: 94 },
}

/** band → label for the human→AI provenance meter */
export const ORIGIN_META: Record<OriginBand, { label: string }> = {
  LIKELY_HUMAN: { label: 'Likely human-made' },
  LEANS_HUMAN: { label: 'Leans human' },
  UNCERTAIN: { label: 'Inconclusive' },
  LEANS_AI: { label: 'Leans AI' },
  LIKELY_AI: { label: 'Likely AI-generated' },
}

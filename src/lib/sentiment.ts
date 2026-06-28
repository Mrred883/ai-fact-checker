import { callClaude } from './anthropic'
import { extractJson } from './factcheck'
import { uid, cleanText } from './utils'
import type {
  Settings,
  SentimentLabel,
  SentimentReport,
  SentimentTheme,
  SentimentQuote,
} from './types'

const LABELS: SentimentLabel[] = [
  'VERY_NEGATIVE',
  'NEGATIVE',
  'MIXED',
  'NEUTRAL',
  'POSITIVE',
  'VERY_POSITIVE',
]

function coerceLabel(v: any): SentimentLabel {
  const up = String(v ?? '').toUpperCase().replace(/[\s-]+/g, '_')
  return (LABELS as string[]).includes(up) ? (up as SentimentLabel) : 'NEUTRAL'
}

function coerceTone(v: any): 'positive' | 'negative' | 'neutral' {
  const t = String(v ?? '').toLowerCase()
  return t === 'positive' || t === 'negative' ? t : 'neutral'
}

function num(v: any, lo: number, hi: number, fallback: number): number {
  const x = Number(v)
  if (!Number.isFinite(x)) return fallback
  return Math.max(lo, Math.min(hi, x))
}

function buildSystem(): string {
  return `You are a sentiment-analysis engine for subjective text: social comments, tweets, reviews, or replies about a person, brand, or topic. You read the crowd and report how it feels — you are NOT fact-checking. Opinions are data here, not claims to verify.

Read every comment/line the user provides. Judge the overall sentiment toward the subject, the spread of positive vs negative vs neutral voices, the recurring themes driving each side, and whether any harassment or toxicity is present. Be neutral and descriptive: report what the crowd feels, do not take a side or moralize.

Definitions:
- overall: one of VERY_NEGATIVE, NEGATIVE, MIXED, NEUTRAL, POSITIVE, VERY_POSITIVE. Use MIXED when strong positive AND strong negative camps coexist; NEUTRAL when most are indifferent/factual.
- score: net sentiment from -1.0 (hostile) to +1.0 (glowing), your calibrated read.
- positive/negative/neutral: the share of items in each bucket, each 0..1, summing to ~1.
- sampleSize: how many distinct comments/items you counted.
- themes: 2-5 recurring topics. Each has label (short phrase, e.g. "praises fast support"), tone (positive|negative|neutral), weight (0..1 share of items touching it).
- quotes: 2-4 short representative quotes pulled verbatim (trimmed) from the input, each tagged by tone. Pick ones that capture the dominant voices.
- toxicity: true if there is notable harassment, slurs, or targeted abuse.
- summary: 2-3 sentences, plain language, describing the crowd's mood and what's driving it.

OUTPUT: Respond with ONLY a single JSON object, no prose, in exactly this shape:
{
  "subject": "<who/what this is about, or empty>",
  "overall": "POSITIVE",
  "score": 0.0,
  "positive": 0.0,
  "negative": 0.0,
  "neutral": 0.0,
  "sampleSize": 0,
  "summary": "<short>",
  "themes": [ { "label": "<short>", "tone": "positive|negative|neutral", "weight": 0.0 } ],
  "quotes": [ { "text": "<verbatim, trimmed>", "tone": "positive|negative|neutral" } ],
  "toxicity": false
}`
}

export interface SentimentResult {
  report: SentimentReport | null
  raw: string
  usage?: { input_tokens: number; output_tokens: number }
}

/** Analyze the crowd sentiment in a block of comments/tweets/reviews. */
export async function analyzeSentiment(
  text: string,
  settings: Settings,
  ctx: { subject?: string; signal?: AbortSignal } = {},
): Promise<SentimentResult> {
  const clean = text.trim()
  if (!clean) return { report: null, raw: '' }

  const user = ctx.subject?.trim()
    ? `Subject of these comments: ${ctx.subject.trim()}\n\nComments:\n${clean}`
    : clean

  const result = await callClaude({
    apiKey: settings.apiKey,
    model: settings.model,
    system: buildSystem(),
    user,
    webSearch: false, // sentiment is subjective — no grounding needed, keeps it fast
    maxTokens: 1536,
    signal: ctx.signal,
  })

  const parsed = extractJson(result.text)
  if (!parsed) return { report: null, raw: result.text, usage: result.usage }

  const themes: SentimentTheme[] = (Array.isArray(parsed.themes) ? parsed.themes : [])
    .filter((t: any) => t && t.label)
    .slice(0, 5)
    .map((t: any) => ({
      label: cleanText(String(t.label)),
      tone: coerceTone(t.tone),
      weight: num(t.weight, 0, 1, 0.2),
    }))

  const quotes: SentimentQuote[] = (Array.isArray(parsed.quotes) ? parsed.quotes : [])
    .filter((q: any) => q && q.text)
    .slice(0, 4)
    .map((q: any) => ({ text: cleanText(String(q.text)), tone: coerceTone(q.tone) }))

  // normalize the three shares so the bar always reads cleanly
  let pos = num(parsed.positive, 0, 1, 0)
  let neg = num(parsed.negative, 0, 1, 0)
  let neu = num(parsed.neutral, 0, 1, 0)
  const sum = pos + neg + neu
  if (sum > 0) {
    pos /= sum
    neg /= sum
    neu /= sum
  } else {
    neu = 1
  }

  const report: SentimentReport = {
    id: uid('s'),
    subject: parsed.subject ? cleanText(String(parsed.subject)) || undefined : ctx.subject?.trim() || undefined,
    overall: coerceLabel(parsed.overall),
    score: num(parsed.score, -1, 1, 0),
    positive: pos,
    negative: neg,
    neutral: neu,
    sampleSize: Math.max(0, Math.round(num(parsed.sampleSize, 0, 100000, 0))),
    summary: cleanText(String(parsed.summary ?? '')),
    themes,
    quotes,
    toxicity: Boolean(parsed.toxicity),
    createdAt: Date.now(),
  }

  return { report, raw: result.text, usage: result.usage }
}

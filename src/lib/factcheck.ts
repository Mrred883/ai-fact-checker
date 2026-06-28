import { callClaude, callClaudeStream, type ClaudeTurn, type ClaudeMediaBlock } from './anthropic'
import { uid, cleanText } from './utils'
import {
  type Asset,
  type Settings,
  type Verdict,
  type VerdictLabel,
} from './types'

const VALID: VerdictLabel[] = [
  'TRUE',
  'SUBSTANTIALLY_TRUE',
  'MISLEADING',
  'FALSE',
  'UNVERIFIABLE',
]

const SENSITIVITY_GUIDE: Record<Settings['sensitivity'], string> = {
  conservative:
    'Only extract clear, consequential, objectively verifiable factual claims (statistics, historical facts, attributions, quantities). Ignore opinions, predictions, vague statements, and small talk.',
  balanced:
    'Extract check-worthy factual claims a reasonable reader might want verified. Skip pure opinion, hypotheticals, and rhetorical questions.',
  aggressive:
    'Extract every claim that has any verifiable factual component, including borderline and implied ones. Still skip pure opinion and value judgements.',
}

function buildSystem(s: Settings): string {
  return `You are an AI fact-checking engine: rigorous, non-partisan, evidence-driven.

Your job: read the user's text (a transcript snippet, an article, or a selection), pull out the factual claims, and verify each using web search. Be neutral, precise, and evidence-driven. Prefer primary and authoritative sources. Do not editorialise.

Claim selection: ${SENSITIVITY_GUIDE[s.sensitivity]}

For EACH claim assign exactly one verdict:
- TRUE - accurate and well supported by evidence.
- SUBSTANTIALLY_TRUE - core point is correct; minor imprecision or missing nuance.
- MISLEADING - technically defensible but creates a false impression, cherry-picked, or missing critical context.
- FALSE - contradicted by the evidence.
- UNVERIFIABLE - cannot be confirmed or refuted with available sources (opinion, prediction, private info, no reliable data).

Rules:
- Speed matters a lot. Default to ZERO searches: if you already know a fact with high confidence, verify it from your own knowledge and move on. Search ONLY for claims that are recent, niche, statistical, or that you are genuinely unsure about — and then one search usually settles it. Never re-verify the obvious or stack multiple searches on one claim.
- Emit claims in order; finish each claim's full JSON object before starting the next (the UI streams them in as they complete).
- When you search, cite the specific sources you relied on. If a claim needed no search, citations may be empty.
- confidence is YOUR calibrated certainty in the verdict, 0.0-1.0.
- explanation: 1-3 sentences, plain language, state the key evidence. No hedging filler.
- correction: ONLY for FALSE or MISLEADING verdicts, give the accurate information that sets the record straight — 1-2 sentences stating what is actually true, so the reader leaves with the correct fact. Omit it (or leave empty) for TRUE, SUBSTANTIALLY_TRUE, and UNVERIFIABLE.
- If the text contains no check-worthy factual claims, return {"claims": []}.
- Attribute a speaker only if the text clearly identifies one; otherwise omit it.

OUTPUT: Respond with ONLY a single JSON object, no prose before or after, in exactly this shape:
{
  "claims": [
    {
      "claim": "<the claim, quoted or tightly paraphrased>",
      "speaker": "<optional>",
      "verdict": "TRUE|SUBSTANTIALLY_TRUE|MISLEADING|FALSE|UNVERIFIABLE",
      "confidence": 0.0,
      "explanation": "<short>",
      "correction": "<the accurate fact — only for FALSE/MISLEADING, else omit>",
      "citations": [ { "title": "<source title>", "url": "<url>" } ]
    }
  ]
}`
}

/** Pull a JSON object out of an LLM response that may include fences or stray prose. */
export function extractJson(text: string): any | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  if (start === -1) return null

  // brace-balance, ignoring braces inside strings
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function coerceVerdict(v: any): VerdictLabel {
  const up = String(v ?? '').toUpperCase().replace(/[\s-]+/g, '_')
  return (VALID as string[]).includes(up) ? (up as VerdictLabel) : 'UNVERIFIABLE'
}

function clamp01(n: any): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0.5
  return Math.max(0, Math.min(1, x))
}

export interface FactCheckResult {
  verdicts: Verdict[]
  raw: string
  /** model-reported token usage, for the popup meter */
  usage?: { input_tokens: number; output_tokens: number }
}

/** Map one parsed claim object → a Verdict. */
function claimToVerdict(
  c: any,
  harvested: { title: string; url: string }[],
  source: Verdict['source'],
  extra: { pageUrl?: string } = {},
): Verdict {
  const cites = Array.isArray(c.citations) ? c.citations : []
  const merged = [...cites, ...harvested]
  const dedup = new Map<string, { title: string; url: string }>()
  for (const m of merged) {
    if (m?.url && !dedup.has(m.url)) dedup.set(m.url, { title: m.title || m.url, url: m.url })
  }
  const verdict = coerceVerdict(c.verdict)
  const correction =
    (verdict === 'FALSE' || verdict === 'MISLEADING') && c.correction
      ? cleanText(String(c.correction)) || undefined
      : undefined
  return {
    id: uid('v'),
    claim: cleanText(String(c.claim)),
    speaker: c.speaker ? cleanText(String(c.speaker)) || undefined : undefined,
    verdict,
    confidence: clamp01(c.confidence),
    explanation: cleanText(String(c.explanation ?? '')),
    correction,
    citations: [...dedup.values()].map((d) => ({ title: cleanText(d.title), url: d.url })).slice(0, 6),
    createdAt: Date.now(),
    source,
    pageUrl: extra.pageUrl,
  } satisfies Verdict
}

/** Parse the model's {claims:[...]} JSON into Verdict objects (shared by text + asset paths). */
function claimsToVerdicts(
  raw: string,
  harvested: { title: string; url: string }[],
  source: Verdict['source'],
  extra: { pageUrl?: string } = {},
): Verdict[] {
  const parsed = extractJson(raw)
  const claims: any[] = Array.isArray(parsed?.claims) ? parsed.claims : []
  return claims
    .filter((c) => c && typeof c.claim === 'string' && c.claim.trim())
    .map((c) => claimToVerdict(c, harvested, source, extra))
}

/**
 * Pull the COMPLETE claim objects from a partial JSON stream. Returns each fully
 * closed `{...}` inside the "claims" array; trailing half-written object is skipped
 * until it closes. Used to emit verdicts incrementally as the model streams.
 */
function completeClaimsFromPartial(partial: string): any[] {
  const key = partial.indexOf('"claims"')
  if (key === -1) return []
  const arrStart = partial.indexOf('[', key)
  if (arrStart === -1) return []

  const out: any[] = []
  let i = arrStart + 1
  let depth = 0
  let objStart = -1
  let inStr = false
  let esc = false
  for (; i < partial.length; i++) {
    const ch = partial[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try {
          out.push(JSON.parse(partial.slice(objStart, i + 1)))
        } catch {
          /* malformed — skip */
        }
        objStart = -1
      }
    } else if (ch === ']' && depth === 0) {
      break
    }
  }
  return out
}

/**
 * Extract + verify all claims in a block of text in a single grounded call.
 * Used for selection, article scan, and live-audio transcript segments.
 */
export async function factCheckText(
  text: string,
  source: Verdict['source'],
  settings: Settings,
  ctx: { pageUrl?: string; signal?: AbortSignal; maxSearches?: number } = {},
): Promise<FactCheckResult> {
  const clean = text.trim()
  if (!clean) return { verdicts: [], raw: '' }

  const result = await callClaude({
    apiKey: settings.apiKey,
    model: settings.model,
    system: buildSystem(settings),
    user: clean,
    webSearch: true,
    // fewer searches = lower latency; caller can cap it tighter (e.g. live audio)
    maxSearches: Math.max(1, ctx.maxSearches ?? settings.maxSearches),
    // article scans can surface many claims; keep audio/selection lean for speed
    maxTokens: source === 'article' ? 2560 : 1536,
    signal: ctx.signal,
  })

  const verdicts = claimsToVerdicts(result.text, result.citations, source, { pageUrl: ctx.pageUrl })

  return { verdicts, raw: result.text, usage: result.usage }
}

/**
 * Streaming fact-check: emits each verdict via `onVerdict` the moment its claim
 * object finishes in the stream — so the UI fills in one card at a time instead
 * of waiting for the whole batch. Resolves with the full verdict list.
 */
export async function factCheckTextStream(
  text: string,
  source: Verdict['source'],
  settings: Settings,
  onVerdict: (v: Verdict) => void,
  ctx: { pageUrl?: string; signal?: AbortSignal; maxSearches?: number } = {},
): Promise<FactCheckResult> {
  const clean = text.trim()
  if (!clean) return { verdicts: [], raw: '' }

  const verdicts: Verdict[] = [] // stable list; ids never change after first emit
  let emitted = 0
  const result = await callClaudeStream(
    {
      apiKey: settings.apiKey,
      model: settings.model,
      system: buildSystem(settings),
      user: clean,
      webSearch: true,
      maxSearches: Math.max(1, ctx.maxSearches ?? settings.maxSearches),
      maxTokens: source === 'article' ? 2560 : 1536,
      signal: ctx.signal,
    },
    (full) => {
      const claims = completeClaimsFromPartial(full)
      for (let i = emitted; i < claims.length; i++) {
        const c = claims[i]
        if (c && typeof c.claim === 'string' && c.claim.trim()) {
          const v = claimToVerdict(c, [], source, { pageUrl: ctx.pageUrl })
          verdicts.push(v)
          onVerdict(v)
        }
      }
      if (claims.length > emitted) emitted = claims.length
    },
  )

  // reconcile: patch harvested web_search citations onto the already-emitted
  // verdicts (same order), keeping their stable ids. Fall back to a full parse
  // only if the stream produced nothing (e.g. JSON arrived in one chunk).
  if (verdicts.length) {
    const finals = claimsToVerdicts(result.text, result.citations, source, { pageUrl: ctx.pageUrl })
    for (let i = 0; i < verdicts.length && i < finals.length; i++) {
      if (finals[i].citations.length) verdicts[i].citations = finals[i].citations
    }
    return { verdicts, raw: result.text, usage: result.usage }
  }
  const parsed = claimsToVerdicts(result.text, result.citations, source, { pageUrl: ctx.pageUrl })
  parsed.forEach(onVerdict)
  return { verdicts: parsed, raw: result.text, usage: result.usage }
}

// ── follow-up Q&A on a single verdict ────────────────────────────────────────

export interface AskResult {
  answer: string
  citations: { title: string; url: string }[]
}

function buildAskSystem(v: Verdict): string {
  const verdictLine = `${v.verdict} (confidence ${(v.confidence * 100).toFixed(0)}%)`
  return `You are an AI fact-checking assistant answering follow-up questions about ONE claim you already checked. Stay tightly on this topic.

The claim under discussion:
"${v.claim}"${v.speaker ? `\nAttributed to: ${v.speaker}` : ''}
Your verdict: ${verdictLine}
Your reasoning: ${v.explanation}${v.correction ? `\nThe accurate fact: ${v.correction}` : ''}

Answer the user's question about this claim and topic. Be neutral, precise, evidence-driven. Use web search when current or specific facts would help — but use the fewest searches needed. When you rely on a source, cite it.

Keep answers concise and conversational: 1-4 short paragraphs, plain language. Output PLAIN TEXT ONLY — no markdown, no HTML, no bullet symbols, no asterisks or backticks. If a question is unrelated to this claim, gently steer back to it.`
}

/**
 * Ask a follow-up question about an already-checked verdict.
 * `history` is the prior Q&A turns for this card (oldest first), excluding the new question.
 */
export async function askAboutVerdict(
  v: Verdict,
  question: string,
  history: ClaudeTurn[],
  settings: Settings,
  ctx: { signal?: AbortSignal } = {},
): Promise<AskResult> {
  const q = question.trim()
  if (!q) return { answer: '', citations: [] }

  const messages: ClaudeTurn[] = [...history, { role: 'user', content: q }]

  const result = await callClaude({
    apiKey: settings.apiKey,
    model: settings.model,
    system: buildAskSystem(v),
    messages,
    webSearch: true,
    maxSearches: Math.min(Math.max(1, settings.maxSearches), 3),
    maxTokens: 1024,
    signal: ctx.signal,
  })

  return { answer: cleanText(result.text), citations: result.citations }
}

// ── uploaded assets: fact-check + ask ────────────────────────────────────────

/** Turn assets into the media blocks + inline-text needed for a user turn. */
function assetsToTurn(assets: Asset[], prompt: string): ClaudeTurn {
  const media: ClaudeMediaBlock[] = []
  const textParts: string[] = []
  for (const a of assets) {
    if (a.kind === 'text' && a.text) {
      textParts.push(`--- ${a.name} ---\n${a.text.slice(0, 12000)}`)
    } else if (a.data && (a.kind === 'image' || a.kind === 'document')) {
      media.push({ kind: a.kind, mediaType: a.mediaType, data: a.data })
    }
  }
  const content = [textParts.length ? textParts.join('\n\n') : '', prompt]
    .filter(Boolean)
    .join('\n\n')
  return { role: 'user', content, media: media.length ? media : undefined }
}

/** Fact-check the claims contained in the uploaded assets. */
export async function factCheckAssets(
  assets: Asset[],
  settings: Settings,
  ctx: { signal?: AbortSignal } = {},
): Promise<FactCheckResult> {
  if (!assets.length) return { verdicts: [], raw: '' }

  const turn = assetsToTurn(
    assets,
    'Read the attached document(s)/image(s) above. Extract the factual claims they make and verify each one per your instructions. Respond with ONLY the JSON object.',
  )

  const result = await callClaude({
    apiKey: settings.apiKey,
    model: settings.model,
    system: buildSystem(settings),
    messages: [turn],
    webSearch: true,
    maxSearches: Math.max(1, settings.maxSearches),
    maxTokens: 3072,
    signal: ctx.signal,
  })

  const verdicts = claimsToVerdicts(result.text, result.citations, 'asset')
  return { verdicts, raw: result.text, usage: result.usage }
}

function buildAssetAskSystem(): string {
  return `You are an AI assistant answering questions about the user's uploaded documents and images, and fact-checking against them.

Ground your answers in the attached assets first. When the user asks whether something is true, compare it against the documents AND verify with web search where current or external facts matter — use the fewest searches needed, and cite sources you rely on. If the assets don't cover something, say so plainly rather than guessing.

Keep answers concise and conversational: 1-4 short paragraphs, plain language. Output PLAIN TEXT ONLY — no markdown, no HTML, no bullet symbols, no asterisks or backticks.`
}

/**
 * Ask a question grounded on the uploaded assets.
 * The assets ride along on the FIRST user turn; later turns are plain text follow-ups.
 */
export async function askAboutAssets(
  assets: Asset[],
  question: string,
  history: ClaudeTurn[],
  settings: Settings,
  ctx: { signal?: AbortSignal } = {},
): Promise<AskResult> {
  const q = question.trim()
  if (!q) return { answer: '', citations: [] }

  // assets ride on the very first user turn; rebuild that turn each call so the
  // documents stay in context across the whole follow-up thread
  let messages: ClaudeTurn[]
  if (history.length === 0) {
    messages = [assetsToTurn(assets, q)]
  } else {
    const [firstUser, ...rest] = history
    const firstWithAssets = assetsToTurn(assets, firstUser.content)
    messages = [firstWithAssets, ...rest, { role: 'user', content: q }]
  }

  const result = await callClaude({
    apiKey: settings.apiKey,
    model: settings.model,
    system: buildAssetAskSystem(),
    messages,
    webSearch: true,
    maxSearches: Math.min(Math.max(1, settings.maxSearches), 3),
    maxTokens: 1280,
    signal: ctx.signal,
  })

  return { answer: cleanText(result.text), citations: result.citations }
}

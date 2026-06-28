import type { ClaudeModel } from './types'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
/**
 * Server-side web search tool (Anthropic runs the searches; one request, citations returned).
 * The tool version depends on the model: current-gen models (Opus 4.x, Sonnet 4.6) use the
 * dynamic-filtering variant; older models (Haiku 4.5) use the basic variant.
 */
const WEB_SEARCH_LATEST = 'web_search_20260209'
const WEB_SEARCH_BASIC = 'web_search_20250305'

function webSearchToolType(model: string): string {
  // Haiku 4.5 (and anything older) only supports the basic variant.
  if (model.includes('haiku')) return WEB_SEARCH_BASIC
  return WEB_SEARCH_LATEST
}

export interface ClaudeContentText {
  type: 'text'
  text: string
  citations?: Array<{ type: string; url?: string; title?: string }>
}

export interface ClaudeResult {
  /** concatenated text from all text blocks */
  text: string
  /** citations harvested from web_search-grounded text blocks */
  citations: Array<{ title: string; url: string }>
  usage?: { input_tokens: number; output_tokens: number }
  stopReason?: string
}

/** an image or PDF attached to a user turn (base64, no data: prefix) */
export interface ClaudeMediaBlock {
  kind: 'image' | 'document'
  mediaType: string // e.g. image/png, application/pdf
  data: string // base64
}

export interface ClaudeTurn {
  role: 'user' | 'assistant'
  content: string
  /** optional attachments — only meaningful on user turns */
  media?: ClaudeMediaBlock[]
}

/** Build the wire `content` for a turn: text plus any image/document blocks. */
function turnToWire(t: ClaudeTurn): unknown {
  if (!t.media?.length) return t.content
  const blocks: unknown[] = t.media.map((m) =>
    m.kind === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: m.mediaType, data: m.data } }
      : {
          type: 'document',
          source: { type: 'base64', media_type: m.mediaType, data: m.data },
        },
  )
  if (t.content) blocks.push({ type: 'text', text: t.content })
  return blocks
}

export interface CallOptions {
  apiKey: string
  model: ClaudeModel
  system: string
  /** single user turn — shorthand for messages: [{role:'user', content: user}] */
  user?: string
  /** full multi-turn conversation; takes precedence over `user` */
  messages?: ClaudeTurn[]
  maxTokens?: number
  /** enable grounded web search */
  webSearch?: boolean
  maxSearches?: number
  signal?: AbortSignal
}

export class AnthropicError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AnthropicError'
    this.status = status
  }
}

/**
 * Single round-trip call to Claude. web_search is a *server* tool, so Anthropic
 * runs the searches itself and returns the final grounded answer - no client loop.
 */
export async function callClaude(opts: CallOptions): Promise<ClaudeResult> {
  const {
    apiKey,
    model,
    system,
    user,
    messages,
    maxTokens = 2048,
    webSearch = true,
    maxSearches = 5,
    signal,
  } = opts

  if (!apiKey) throw new AnthropicError('Missing API key. Add it in settings.', 401)

  const turns = messages?.length ? messages : [{ role: 'user' as const, content: user ?? '' }]

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system,
    messages: turns.map((t) => ({ role: t.role, content: turnToWire(t) })),
  }
  if (webSearch) {
    body.tools = [
      { type: webSearchToolType(model), name: 'web_search', max_uses: Math.max(1, maxSearches) },
    ]
  }

  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        // required to call the API directly from a browser/extension context
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    throw new AnthropicError(`Network error reaching Anthropic: ${String(e)}`)
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const err = await res.json()
      detail = err?.error?.message ?? detail
    } catch {
      /* ignore parse error */
    }
    if (res.status === 401) detail = 'Invalid API key. Check it in settings.'
    if (res.status === 429) detail = 'Rate limited by Anthropic. Slow down and retry.'
    throw new AnthropicError(detail, res.status)
  }

  const data = await res.json()
  const blocks: any[] = Array.isArray(data?.content) ? data.content : []

  let text = ''
  const citations: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()

  for (const b of blocks) {
    if (b?.type === 'text' && typeof b.text === 'string') {
      text += b.text
      for (const c of b.citations ?? []) {
        const url = c?.url
        if (url && !seen.has(url)) {
          seen.add(url)
          citations.push({ title: c.title || url, url })
        }
      }
    }
  }

  return {
    text,
    citations,
    usage: data?.usage,
    stopReason: data?.stop_reason,
  }
}

async function postStream(opts: CallOptions): Promise<Response> {
  const {
    apiKey,
    model,
    system,
    user,
    messages,
    maxTokens = 2048,
    webSearch = true,
    maxSearches = 5,
    signal,
  } = opts
  if (!apiKey) throw new AnthropicError('Missing API key. Add it in settings.', 401)
  const turns = messages?.length ? messages : [{ role: 'user' as const, content: user ?? '' }]
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system,
    stream: true,
    messages: turns.map((t) => ({ role: t.role, content: turnToWire(t) })),
  }
  if (webSearch) {
    body.tools = [
      { type: webSearchToolType(model), name: 'web_search', max_uses: Math.max(1, maxSearches) },
    ]
  }
  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    throw new AnthropicError(`Network error reaching Anthropic: ${String(e)}`)
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const err = await res.json()
      detail = err?.error?.message ?? detail
    } catch {
      /* ignore */
    }
    if (res.status === 401) detail = 'Invalid API key. Check it in settings.'
    if (res.status === 429) detail = 'Rate limited by Anthropic. Slow down and retry.'
    throw new AnthropicError(detail, res.status)
  }
  return res
}

/**
 * Streaming variant. Calls `onText(fullTextSoFar)` as text accumulates so the
 * caller can extract + emit verdicts incrementally. Resolves with the final
 * concatenated text + harvested citations.
 */
export async function callClaudeStream(
  opts: CallOptions,
  onText: (fullText: string) => void,
): Promise<ClaudeResult> {
  const res = await postStream(opts)
  const reader = res.body?.getReader()
  if (!reader) throw new AnthropicError('No response stream from Anthropic.')

  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  const citations: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()
  let usage: ClaudeResult['usage']
  let stopReason: string | undefined

  function handleEvent(payload: string) {
    let evt: any
    try {
      evt = JSON.parse(payload)
    } catch {
      return
    }
    const type = evt?.type
    if (type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      text += evt.delta.text ?? ''
      onText(text)
    } else if (type === 'content_block_start' && evt.content_block?.type === 'text') {
      for (const c of evt.content_block.citations ?? []) {
        if (c?.url && !seen.has(c.url)) {
          seen.add(c.url)
          citations.push({ title: c.title || c.url, url: c.url })
        }
      }
    } else if (type === 'message_delta') {
      if (evt.usage) usage = evt.usage
      if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason
    }
  }

  // SSE frames are separated by a blank line; each frame has one or more
  // "data: <json>" lines (we ignore the "event:" line — type is in the json).
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data && data !== '[DONE]') handleEvent(data)
      }
    }
  }

  return { text, citations, usage, stopReason }
}

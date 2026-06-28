import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Check, MessagesSquare, CornerDownLeft, Loader2 } from 'lucide-react'
import { type Verdict, type VerdictLabel, VERDICT_META } from '@/lib/types'
import { askAboutVerdict } from '@/lib/factcheck'
import { getSettings } from '@/lib/storage'
import { cn, hostFromUrl } from '@/lib/utils'
import type { ClaudeTurn } from '@/lib/anthropic'

interface AskMsg {
  role: 'user' | 'assistant'
  content: string
  citations?: { title: string; url: string }[]
}

/**
 * When this UI instance loaded. A verdict is "New" if it arrived AFTER the UI
 * opened — i.e. while the user is watching. Set once per popup/panel load, so
 * closing and reopening makes prior verdicts count as already-seen (no badge).
 */
const MOUNT_TS = Date.now()

/** where each verdict sits on the false → true axis (percent) */
const POS: Record<VerdictLabel, number> = {
  FALSE: 7,
  MISLEADING: 38,
  UNVERIFIABLE: 50,
  SUBSTANTIALLY_TRUE: 80,
  TRUE: 94,
}

export function VerdictCard({ v }: { v: Verdict; compact?: boolean }) {
  const meta = VERDICT_META[v.verdict]
  const pct = Math.round(v.confidence * 100)
  const pos = POS[v.verdict]
  const flat = v.verdict === 'UNVERIFIABLE'

  // "New" = landed after this UI opened; stays the whole session, gone on reopen
  const showNew = v.createdAt >= MOUNT_TS

  // ── follow-up Q&A thread ──
  const [askOpen, setAskOpen] = useState(false)
  const [thread, setThread] = useState<AskMsg[]>([])
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (askOpen) threadEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [thread, asking, askOpen])

  async function submitQuestion(e?: React.FormEvent) {
    e?.preventDefault()
    const q = draft.trim()
    if (!q || asking) return
    setDraft('')
    setAskError(null)
    setThread((t) => [...t, { role: 'user', content: q }])
    setAsking(true)
    try {
      const history: ClaudeTurn[] = thread.map((m) => ({ role: m.role, content: m.content }))
      const settings = await getSettings()
      const { answer, citations } = await askAboutVerdict(v, q, history, settings)
      setThread((t) => [...t, { role: 'assistant', content: answer || '(no answer)', citations }])
    } catch (err) {
      setAskError(err instanceof Error ? err.message : String(err))
    } finally {
      setAsking(false)
    }
  }

  return (
    <article className="relative rounded-lg border border-border bg-card p-3.5 shadow-[0_1px_2px_hsl(var(--foreground)/0.05)]">
      {showNew && (
        <span className="absolute right-2.5 top-2.5 z-10 rounded-full bg-primary px-2 py-0.5 font-data text-[8.5px] font-bold uppercase tracking-[0.16em] text-primary-foreground shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.6)]">
          New
        </span>
      )}

      {/* the claim, quoted from the page */}
      <p
        className={cn(
          'border-l-2 border-primary/40 pl-2.5 text-[13.5px] font-semibold leading-snug text-card-foreground',
          showNew && 'pr-12',
        )}
      >
        {v.claim}
        {v.speaker && (
          <span className="ml-1 font-data text-[10px] font-normal text-muted-foreground">
            — {v.speaker}
          </span>
        )}
      </p>

      {/* signature: the litmus truth scale */}
      <div className="mt-3.5">
        <div className={cn('litmus-track', flat && 'is-flat')}>
          <span className={cn('litmus-marker', `mk-${v.verdict}`)} style={{ left: `${pos}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between font-data text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>False</span>
          <span>True</span>
        </div>
      </div>

      {/* verdict label + confidence readout */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <span className={cn('size-2 rounded-[2px]', `mk-${v.verdict}`)} />
          <span className={cn('font-display text-sm font-bold uppercase tracking-wide', `v-${v.verdict}`)}>
            {meta.label}
          </span>
        </span>
        <span className="flex items-baseline gap-1">
          <span className="font-data text-lg font-semibold leading-none tabular-nums text-foreground">
            {pct}
          </span>
          <span className="font-data text-[9px] uppercase tracking-wider text-muted-foreground">
            % conf
          </span>
        </span>
      </div>

      {/* reasoning */}
      {v.explanation && (
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{v.explanation}</p>
      )}

      {/* set the record straight — the accurate fact for wrong/misleading claims */}
      {v.correction && (
        <div className="setright mt-3 rounded-md py-2 pl-2.5 pr-3">
          <p className="setright-kicker mb-1 flex items-center gap-1 font-data text-[8.5px] font-semibold uppercase tracking-[0.16em]">
            <Check className="size-3" strokeWidth={3} />
            The accurate fact
          </p>
          <p className="text-xs leading-relaxed text-card-foreground">{v.correction}</p>
        </div>
      )}

      {/* sources, numbered like footnotes */}
      {v.citations.length > 0 && (
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="mb-1.5 font-data text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground">
            Sources
          </p>
          <ul className="space-y-0.5">
            {v.citations.slice(0, 4).map((c, i) => (
              <li key={c.url}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px] text-foreground/85 transition-colors hover:bg-primary/10"
                >
                  <span className="font-data text-[10px] tabular-nums text-primary">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{c.title}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1 font-data text-[9.5px] text-muted-foreground">
                    {hostFromUrl(c.url)}
                    <ExternalLink className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── ask: follow-up Q&A on this fact ── */}
      <div className="mt-3 border-t border-border pt-2.5">
        <button
          onClick={() => setAskOpen((o) => !o)}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
            askOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <MessagesSquare className="size-3.5" />
          Ask about this
          {thread.length > 0 && (
            <span className="tabular-nums text-muted-foreground/70">{thread.filter((m) => m.role === 'user').length}</span>
          )}
          <CornerDownLeft
            className={cn('ml-auto size-3 transition-transform', askOpen ? 'rotate-90' : '-rotate-90')}
          />
        </button>

        {askOpen && (
          <div className="mt-2 space-y-2">
            {thread.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ask-q ml-6 rounded-lg px-2.5 py-1.5 text-[12px] leading-snug">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="ask-a mr-2 rounded-lg px-2.5 py-2">
                  <p className="whitespace-pre-line text-[12px] leading-relaxed text-card-foreground">
                    {m.content}
                  </p>
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.citations.slice(0, 4).map((c, j) => (
                        <a
                          key={c.url}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-data text-[9.5px] text-primary transition-colors hover:bg-primary/20"
                        >
                          <span className="tabular-nums">{String(j + 1).padStart(2, '0')}</span>
                          {hostFromUrl(c.url)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}

            {asking && (
              <div className="ask-a mr-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Searching & answering…
              </div>
            )}

            {askError && (
              <p className="px-1 text-[11px] text-[hsl(var(--danger))]">{askError}</p>
            )}

            <form onSubmit={submitQuestion} className="flex items-end gap-1.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask a follow-up…"
                disabled={asking}
                className="h-8 flex-1 rounded-lg border border-border bg-background px-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={asking || !draft.trim()}
                className="btn-primary grid h-8 w-8 shrink-0 place-items-center rounded-lg disabled:opacity-40"
                aria-label="Send question"
              >
                <CornerDownLeft className="size-3.5" />
              </button>
            </form>
            <div ref={threadEndRef} />
          </div>
        )}
      </div>
    </article>
  )
}

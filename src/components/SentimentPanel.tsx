import { useEffect, useState } from 'react'
import { Loader2, Gauge, Trash2 } from 'lucide-react'
import type { SentimentReport, Settings } from '@/lib/types'
import { analyzeSentiment } from '@/lib/sentiment'
import { getSentiment, addSentiment, clearSentiment, getSettings } from '@/lib/storage'
import { SentimentCard } from '@/components/SentimentCard'

export function SentimentPanel({ settings }: { settings: Settings }) {
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reports, setReports] = useState<SentimentReport[]>([])

  useEffect(() => {
    getSentiment().then(setReports)
  }, [])

  async function analyze() {
    const body = text.trim()
    if (body.length < 15) {
      setError('Paste a few comments, tweets, or reviews to analyze.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const s = await getSettings()
      const { report } = await analyzeSentiment(body, s, { subject: subject.trim() || undefined })
      if (!report) throw new Error('Could not read sentiment from that text.')
      const next = await addSentiment(report)
      setReports(next)
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  void settings

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* input */}
      <div className="shrink-0 space-y-2 p-3">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Who or what is this about? (optional)"
          className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste comments, tweets, replies, or reviews — one per line works best…"
          rows={5}
          className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
        />
        <button
          onClick={analyze}
          disabled={busy}
          className="btn-primary flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Gauge className="size-4" />}
          {busy ? 'Reading the room…' : 'Analyze sentiment'}
        </button>
        {error && <p className="px-1 text-[11px] text-[hsl(var(--danger))]">{error}</p>}
      </div>

      {/* results */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Gauge className="size-7 text-foreground/40" />
            <p className="max-w-[16rem] text-[11px] leading-relaxed text-muted-foreground">
              Drop a pile of opinions about someone or something — get the crowd's mood, what's driving it, and the loudest voices.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="font-data text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Reports
              </span>
              <span className="font-data text-[9px] text-muted-foreground/70">{reports.length}</span>
              <span className="ml-1 h-px flex-1 bg-border" />
              <button
                onClick={() => {
                  clearSentiment()
                  setReports([])
                }}
                className="flex items-center gap-1 font-data text-[9px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-[hsl(var(--danger))]"
              >
                <Trash2 className="size-3" />
                Clear
              </button>
            </div>
            {reports.map((r) => (
              <SentimentCard key={r.id} r={r} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

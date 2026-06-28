import { Users, AlertTriangle } from 'lucide-react'
import { type SentimentReport, SENTIMENT_META } from '@/lib/types'
import { cn } from '@/lib/utils'

const TONE_TEXT = { positive: 'tone-positive', negative: 'tone-negative', neutral: 'tone-neutral' } as const
const TONE_FILL = { positive: 'fill-pos', negative: 'fill-neg', neutral: 'fill-neu' } as const

function pct(n: number) {
  return Math.round(n * 100)
}

export function SentimentCard({ r }: { r: SentimentReport }) {
  const meta = SENTIMENT_META[r.overall]
  const net = Math.round(r.score * 100)
  const moodTone = r.score > 0.15 ? 'positive' : r.score < -0.15 ? 'negative' : 'neutral'

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.05)]">
      {/* hero — the net score anchors the read */}
      <div className="flex items-stretch gap-3 p-3.5 pb-3">
        <div className="flex flex-col items-center justify-center rounded-lg bg-muted/60 px-3">
          <span className={cn('font-display text-[26px] font-bold leading-none tabular-nums', TONE_TEXT[moodTone])}>
            {net > 0 ? `+${net}` : net}
          </span>
          <span className="mt-1 font-data text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
            net mood
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-card-foreground">
              {r.subject || 'Crowd sentiment'}
            </p>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 font-data text-[9px] tabular-nums text-muted-foreground">
              <Users className="size-2.5" />
              {r.sampleSize || '—'}
            </span>
          </div>
          <span className={cn('mt-0.5 font-display text-base font-bold uppercase tracking-wide', TONE_TEXT[moodTone])}>
            {meta.label}
          </span>
          {/* the gauge: hostile → glowing */}
          <div className="mt-2">
            <div className="litmus-track">
              <span className={cn('litmus-marker', `mk-${moodTone === 'positive' ? 'TRUE' : moodTone === 'negative' ? 'FALSE' : 'UNVERIFIABLE'}`)} style={{ left: `${meta.pos}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-data text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>Hostile</span>
              <span>Glowing</span>
            </div>
          </div>
        </div>
      </div>

      {/* split bar — the spread of voices */}
      <div className="px-3.5">
        <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border">
          {r.positive > 0 && <span className="fill-pos h-full" style={{ width: `${pct(r.positive)}%` }} />}
          {r.neutral > 0 && <span className="fill-neu h-full" style={{ width: `${pct(r.neutral)}%` }} />}
          {r.negative > 0 && <span className="fill-neg h-full" style={{ width: `${pct(r.negative)}%` }} />}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 font-data text-[9px]">
          <Legend fill="fill-pos" tone="tone-positive" label="Positive" value={pct(r.positive)} />
          <Legend fill="fill-neu" tone="tone-neutral" label="Neutral" value={pct(r.neutral)} />
          <Legend fill="fill-neg" tone="tone-negative" label="Negative" value={pct(r.negative)} />
        </div>
      </div>

      {/* summary */}
      {r.summary && (
        <p className="mt-3 px-3.5 text-xs leading-relaxed text-muted-foreground">{r.summary}</p>
      )}

      {/* toxicity flag */}
      {r.toxicity && (
        <div className="bg-tone-negative mx-3.5 mt-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5">
          <AlertTriangle className="size-3.5 tone-negative" />
          <span className="text-[11px] font-medium text-card-foreground">
            Harassment or toxic language detected
          </span>
        </div>
      )}

      {/* themes — weight bars show how loud each topic is */}
      {r.themes.length > 0 && (
        <div className="mt-3.5 px-3.5">
          <p className="mb-2 font-data text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground">
            What's driving it
          </p>
          <div className="space-y-2">
            {r.themes.map((t, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground/85">{t.label}</span>
                  <span className="shrink-0 font-data text-[9px] tabular-nums text-muted-foreground">
                    {pct(t.weight)}%
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn('block h-full rounded-full', TONE_FILL[t.tone])}
                    style={{ width: `${Math.max(4, pct(t.weight))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-3.5" />
    </article>
  )
}

function Legend({
  fill,
  tone,
  label,
  value,
}: {
  fill: string
  tone: string
  label: string
  value: number
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md bg-muted/50 py-1.5">
      <span className="flex items-center gap-1">
        <span className={cn('size-1.5 rounded-full', fill)} />
        <span className={cn('font-semibold tabular-nums', tone)}>{value}%</span>
      </span>
      <span className="text-[8px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
    </div>
  )
}

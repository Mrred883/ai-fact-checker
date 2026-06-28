import { Fingerprint, Sparkles, Info, BadgeCheck, ShieldQuestion } from 'lucide-react'
import { type OriginReport, ORIGIN_META } from '@/lib/types'
import { cn } from '@/lib/utils'

const SEGMENTS = 8

/** blend human-blue → synthetic-violet by position (0 human, 1 AI) */
function segColor(t: number): string {
  if (t < 0.5) return 'var(--ai-human)'
  if (t < 0.75) return 'var(--ai-mid)'
  return 'var(--ai-synth)'
}

const DOT = { ai: 'dot-ai', human: 'dot-human', neutral: 'dot-neutral' } as const

export function OriginMeter({ r }: { r: OriginReport }) {
  const meta = ORIGIN_META[r.band]
  const lit = Math.round(r.aiLikelihood * SEGMENTS)
  const pctAi = Math.round(r.aiLikelihood * 100)
  const leansAi = r.aiLikelihood >= 0.5
  const conf = Math.round(r.confidence * 100)
  const cred = r.provenance?.hasCredentials
  const verified = r.provenance?.claimsAi

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.05)]">
      {/* verifiable Content Credentials beat any guess — show them up top */}
      {cred && (
        <div
          className={cn(
            'flex items-center gap-2 px-3.5 py-2',
            verified ? 'bg-tone-negative' : 'bg-muted',
          )}
        >
          <BadgeCheck className={cn('size-4 shrink-0', verified ? 'ai-synth' : 'ai-neutral')} />
          <div className="min-w-0 flex-1">
            <p className="font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-card-foreground">
              Content Credentials found
            </p>
            <p className="truncate text-[10.5px] text-muted-foreground">
              {verified ? 'Declares AI-generated' : 'Provenance recorded'}
              {r.provenance?.generator ? ` · ${r.provenance.generator}` : ''}
            </p>
          </div>
        </div>
      )}
      <div className="p-3.5">
      <div className="flex gap-3.5">
        {/* the provenance meter — vertical, fills upward from human to AI */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Sparkles className={cn('size-3', leansAi ? 'ai-synth' : 'ai-neutral')} />
          <div className="prov-meter" role="img" aria-label={`${pctAi}% AI likelihood`}>
            {Array.from({ length: SEGMENTS }, (_, i) => {
              const on = i < lit
              return (
                <span
                  key={i}
                  className={cn('prov-seg', on && 'on')}
                  style={on ? ({ ['--seg-color' as string]: segColor(i / (SEGMENTS - 1)) }) : undefined}
                />
              )
            })}
          </div>
          <Fingerprint className={cn('size-3', leansAi ? 'ai-neutral' : 'ai-human')} />
        </div>

        {/* read-out */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-card-foreground">{r.name}</p>
          <p
            className={cn(
              'mt-0.5 font-display text-sm font-bold uppercase tracking-wide',
              r.band === 'UNCERTAIN' ? 'ai-neutral' : leansAi ? 'ai-synth' : 'ai-human',
            )}
          >
            {meta.label}
          </p>
          <div className="mt-1 flex items-baseline gap-2 font-data text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="tabular-nums">
              <span className="text-foreground">{pctAi}%</span> AI-like
            </span>
            <span className="opacity-40">·</span>
            <span className="tabular-nums">{conf}% conf</span>
          </div>
        </div>
      </div>

      {/* rationale */}
      {r.rationale && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{r.rationale}</p>
      )}

      {/* signals — both directions */}
      {r.signals.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-data text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground">
            What it's reading
          </p>
          <div className="space-y-1.5">
            {r.signals.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={cn('size-1.5 shrink-0 rounded-full', DOT[s.points])} />
                <span className="min-w-0 flex-1 text-[11.5px] text-foreground/85">{s.label}</span>
                <span
                  className={cn(
                    'shrink-0 font-data text-[8.5px] uppercase tracking-wider',
                    s.points === 'ai' ? 'ai-synth' : s.points === 'human' ? 'ai-human' : 'ai-neutral',
                  )}
                >
                  {s.points === 'neutral' ? 'mixed' : s.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* caveat — honest about how strong the read actually is */}
      <div className="mt-3 flex items-start gap-1.5 border-t border-border pt-2.5">
        {verified ? (
          <BadgeCheck className="mt-px size-3 shrink-0 ai-synth" />
        ) : cred ? (
          <ShieldQuestion className="mt-px size-3 shrink-0 text-muted-foreground" />
        ) : (
          <Info className="mt-px size-3 shrink-0 text-muted-foreground" />
        )}
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {verified
            ? 'Read from the file’s embedded Content Credentials — a verifiable provenance record, not a guess. Signature read but not independently trust-verified in-browser.'
            : cred
              ? 'Credentials are present but don’t declare AI generation. The rest is a heuristic likelihood, not proof.'
              : 'No Content Credentials in this file, so this is a heuristic likelihood, not proof. AI detection can be fooled both ways — treat it as one signal.'}
        </p>
      </div>
      </div>
    </article>
  )
}

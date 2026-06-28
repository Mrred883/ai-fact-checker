import { useEffect, useRef, useState } from 'react'
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  FileType2,
  X,
  Loader2,
  ScanSearch,
  CornerDownLeft,
  Fingerprint,
} from 'lucide-react'
import type { Asset, OriginReport, Settings } from '@/lib/types'
import { fileToAsset, hostFromUrl } from '@/lib/utils'
import { getAssets, saveAssets, clearAssets, getSettings } from '@/lib/storage'
import { factCheckAssets, askAboutAssets } from '@/lib/factcheck'
import { detectAssetOrigin } from '@/lib/origin'
import { OriginMeter } from '@/components/OriginMeter'
import { send } from '@/lib/messaging'
import type { ClaudeTurn } from '@/lib/anthropic'
import { cn } from '@/lib/utils'

interface AskMsg {
  role: 'user' | 'assistant'
  content: string
  citations?: { title: string; url: string }[]
}

const KIND_ICON = { image: ImageIcon, document: FileType2, text: FileText } as const

export function AssetsPanel({ settings }: { settings: Settings }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkNote, setCheckNote] = useState<string | null>(null)

  const [thread, setThread] = useState<AskMsg[]>([])
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  // per-asset origin reads, keyed by asset id
  const [origins, setOrigins] = useState<Record<string, OriginReport>>({})
  const [originBusy, setOriginBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getAssets().then(setAssets)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [thread, asking])

  async function addFiles(files: FileList | File[]) {
    setError(null)
    const incoming: Asset[] = []
    for (const f of Array.from(files)) {
      try {
        incoming.push(await fileToAsset(f))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
    if (!incoming.length) return
    const next = await saveAssets([...incoming, ...assets])
    setAssets(next)
  }

  async function removeAsset(id: string) {
    const next = await saveAssets(assets.filter((a) => a.id !== id))
    setAssets(next)
  }

  async function wipe() {
    await clearAssets()
    setAssets([])
    setThread([])
    setCheckNote(null)
  }

  async function checkFacts() {
    if (!assets.length || checking) return
    setError(null)
    setCheckNote(null)
    setChecking(true)
    try {
      const s = await getSettings()
      const { verdicts } = await factCheckAssets(assets, s)
      if (verdicts.length) {
        await send({ type: 'DELIVER_VERDICTS', verdicts })
        setCheckNote(`Found ${verdicts.length} claim${verdicts.length > 1 ? 's' : ''} — see the feed.`)
      } else {
        setCheckNote('No checkable factual claims found in these assets.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  async function checkOrigin(asset: Asset) {
    if (originBusy) return
    setError(null)
    setOriginBusy(asset.id)
    try {
      const s = await getSettings()
      const { report } = await detectAssetOrigin(asset, s)
      if (!report) throw new Error('Could not read the origin of that file.')
      setOrigins((o) => ({ ...o, [asset.id]: report }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOriginBusy(null)
    }
  }

  async function ask(e?: React.FormEvent) {
    e?.preventDefault()
    const q = draft.trim()
    if (!q || asking || !assets.length) return
    setDraft('')
    setError(null)
    setThread((t) => [...t, { role: 'user', content: q }])
    setAsking(true)
    try {
      const history: ClaudeTurn[] = thread.map((m) => ({ role: m.role, content: m.content }))
      const s = await getSettings()
      const { answer, citations } = await askAboutAssets(assets, q, history, s)
      setThread((t) => [...t, { role: 'assistant', content: answer || '(no answer)', citations }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAsking(false)
    }
  }

  void settings // settings come from props for theme parity; live reads use getSettings()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* drop zone */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors',
            drag ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50',
          )}
        >
          <UploadCloud className={cn('size-6', drag ? 'text-primary' : 'text-muted-foreground')} />
          <span className="font-display text-[13px] font-semibold text-foreground">
            Drop files or click to upload
          </span>
          <span className="font-data text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            PDF · Image · Text — max 10 MB
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.csv,.json,.log,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <p className="mx-3 mb-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-[hsl(var(--danger))]">
          {error}
        </p>
      )}

      {/* asset list */}
      {assets.length > 0 && (
        <div className="mx-3 mb-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="font-data text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Uploaded
            </span>
            <span className="font-data text-[9px] text-muted-foreground/70">{assets.length}</span>
            <span className="ml-1 h-px flex-1 bg-border" />
            <button
              onClick={wipe}
              className="font-data text-[9px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-[hsl(var(--danger))]"
            >
              Clear
            </button>
          </div>
          {assets.map((a) => {
            const Icon = KIND_ICON[a.kind]
            const report = origins[a.id]
            const busy = originBusy === a.id
            return (
              <div key={a.id} className="space-y-1.5">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-card-foreground">{a.name}</span>
                  <button
                    onClick={() => checkOrigin(a)}
                    disabled={busy}
                    title="Check if this is AI-generated"
                    className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-data text-[9px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Fingerprint className="size-3" />
                    )}
                    {report ? 'Recheck' : 'Origin'}
                  </button>
                  <button
                    onClick={() => removeAsset(a.id)}
                    className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {report && <OriginMeter r={report} />}
              </div>
            )
          })}

          <button
            onClick={checkFacts}
            disabled={checking}
            className="btn-primary flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold disabled:opacity-60"
          >
            {checking ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            {checking ? 'Checking facts…' : 'Check facts in these'}
          </button>
          {checkNote && (
            <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">{checkNote}</p>
          )}
        </div>
      )}

      {/* ask thread */}
      <div className="flex min-h-0 flex-1 flex-col">
        {assets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <FileText className="size-7 text-foreground/40" />
            <p className="max-w-[16rem] text-[11px] leading-relaxed text-muted-foreground">
              Upload a document or image, then ask questions about it or check the claims it makes.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-2">
              {thread.length === 0 && (
                <p className="px-1 pt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Ask anything about your uploads — “Is the claim on page 2 accurate?”, “Summarize this”, “Does this match the latest data?”
                </p>
              )}
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
                  Reading & answering…
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={ask} className="flex items-end gap-1.5 border-t border-border p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about your uploads…"
                disabled={asking}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={asking || !draft.trim()}
                className="btn-primary grid h-9 w-9 shrink-0 place-items-center rounded-lg disabled:opacity-40"
                aria-label="Send question"
              >
                <CornerDownLeft className="size-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Mic,
  Square,
  ScanText,
  Settings as SettingsIcon,
  AlertCircle,
  KeyRound,
  X,
  ChevronDown,
  ListChecks,
  FolderUp,
  Gauge,
  PanelRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VerdictCard } from '@/components/VerdictCard'
import { AssetsPanel } from '@/components/AssetsPanel'
import { SentimentPanel } from '@/components/SentimentPanel'
import { LitmusMark } from '@/components/LitmusMark'
import { applyTheme } from '@/lib/theme'
import { getSettings, getHistory, clearHistory, onSettingsChanged } from '@/lib/storage'
import { send, sendToTab } from '@/lib/messaging'
import { cn } from '@/lib/utils'
import type { ListenState, Msg } from '@/lib/messaging'
import type { Settings, Verdict } from '@/lib/types'

/** pull readable text from the active tab (runs in the page) */
function extractPageText(): string {
  const pick =
    document.querySelector('article') || document.querySelector('main') || document.body
  const text = (pick as HTMLElement)?.innerText ?? ''
  return text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 9000)
}

type SortKey = 'newest' | 'oldest' | 'az' | 'za'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'New → old' },
  { value: 'oldest', label: 'Old → new' },
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
]

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-2.5">
      <span className="font-display text-xl font-bold leading-none tabular-nums text-foreground">
        {value}
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </span>
      <span className="mt-1 font-data text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function TabBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Mic
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-t-md border-b-2 px-2.5 pb-1.5 pt-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

function FeedTabBtn({
  icon: Icon,
  label,
  count,
  active,
  live,
  onClick,
}: {
  icon: typeof Mic
  label: string
  count: number
  active: boolean
  live?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="relative flex">
        <Icon className="size-3.5" />
        {live && (
          <span className="absolute -right-1 -top-1 size-1.5 animate-pulse rounded-full bg-[hsl(var(--danger))]" />
        )}
      </span>
      {label}
      {count > 0 && <span className="tabular-nums text-muted-foreground/70">{count}</span>}
    </button>
  )
}

function FeedEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <LitmusMark className="h-4 w-20 text-foreground/70" markerAt={50} />
      <div>
        <p className="font-display text-sm font-semibold text-foreground/80">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

export function Popup({ inPanel = false }: { inPanel?: boolean } = {}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [listen, setListen] = useState<ListenState>({ listening: false })
  const [history, setHistory] = useState<Verdict[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('newest')
  const [tab, setTab] = useState<'feed' | 'assets' | 'sentiment'>('feed')
  const [feedTab, setFeedTab] = useState<'text' | 'audio'>('text')

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      applyTheme(s.theme)
    })
    getHistory().then(setHistory)
    send({ type: 'STATE_QUERY' }).then((r) => r.ok && r.state && setListen(r.state))
    return onSettingsChanged((s) => {
      setSettings(s)
      applyTheme(s.theme)
    })
  }, [])

  useEffect(() => {
    const handler = (msg: Msg) => {
      if (msg.type === 'VERDICTS') {
        setHistory((h) => {
          const have = new Set(h.map((x) => x.id))
          const add = msg.verdicts.filter((v) => !have.has(v.id))
          return add.length ? [...add, ...h].slice(0, 200) : h
        })
        // "new" marks come from storage via onUnseenChanged (set in the background)
      } else if (msg.type === 'STATE') {
        setListen(msg.state)
        if (msg.state.error) setError(msg.state.error)
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // when a listen session starts, surface the audio lane automatically
  useEffect(() => {
    if (listen.listening) {
      setTab('feed')
      setFeedTab('audio')
    }
  }, [listen.listening])

  const metrics = useMemo(() => {
    const total = history.length
    const trueish = history.filter(
      (v) => v.verdict === 'TRUE' || v.verdict === 'SUBSTANTIALLY_TRUE',
    ).length
    const flagged = history.filter(
      (v) => v.verdict === 'FALSE' || v.verdict === 'MISLEADING',
    ).length
    const acc = total ? Math.round((trueish / total) * 100) : 0
    return { total, flagged, acc }
  }, [history])

  const sorted = useMemo(() => {
    const arr = [...history]
    switch (sort) {
      case 'oldest':
        return arr.sort((a, b) => a.createdAt - b.createdAt)
      case 'az':
        return arr.sort((a, b) => a.claim.localeCompare(b.claim))
      case 'za':
        return arr.sort((a, b) => b.claim.localeCompare(a.claim))
      default:
        return arr.sort((a, b) => b.createdAt - a.createdAt)
    }
  }, [history, sort])

  // feed splits into two lanes: everything text-derived vs live audio
  const textFacts = sorted.filter((v) => v.source !== 'audio')
  const audioFacts = sorted.filter((v) => v.source === 'audio')

  const toggleListen = useCallback(async () => {
    setError(null)
    if (listen.listening) {
      await send({ type: 'AUDIO_STOP' })
      return
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return setError('No active tab to listen to.')
    const res = await send({ type: 'AUDIO_START', tabId: tab.id })
    if (!res.ok) return setError(res.error)
    // from the transient popup, dock into the side panel so it survives clicking
    // the video. The panel reads the same live state and keeps showing verdicts.
    if (!inPanel) {
      const sp = chrome.sidePanel as unknown as {
        open?: (o: { windowId?: number; tabId?: number }) => Promise<void>
      }
      try {
        if (tab.windowId != null) await sp.open?.({ windowId: tab.windowId })
        else await sp.open?.({ tabId: tab.id })
        window.close()
      } catch {
        /* panel may be unavailable on this page — popup still works, just closes on blur */
      }
    }
  }, [listen.listening, inPanel])

  const scanPage = useCallback(async () => {
    setError(null)
    setBusy(true)
    let scanTabId: number | undefined
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab to scan.')
      scanTabId = tab.id
      // kick off the on-page scanning sweep
      sendToTab(tab.id, { type: 'SCAN_FX', on: true })
      const [{ result } = { result: '' }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageText,
      })
      const text = String(result ?? '')
      if (text.length < 40) throw new Error('Not enough readable text on this page.')
      const res = await send({ type: 'FACTCHECK_TEXT', text, source: 'article', pageUrl: tab.url })
      if (!res.ok) throw new Error(res.error)
      // history + "new" marks arrive via the VERDICTS broadcast + storage; nothing to add here
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (scanTabId != null) sendToTab(scanTabId, { type: 'SCAN_FX', on: false })
      setBusy(false)
    }
  }, [])

  const openOptions = () => chrome.runtime.openOptionsPage()

  // dock the UI into Chrome's side panel — stays open while you click the video
  const openPanel = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const sp = chrome.sidePanel as unknown as {
        open?: (o: { tabId?: number; windowId?: number }) => Promise<void>
      }
      if (tab?.windowId != null) await sp.open?.({ windowId: tab.windowId })
      else if (tab?.id != null) await sp.open?.({ tabId: tab.id })
      window.close() // close the transient popup; the panel takes over
    } catch {
      setError('Could not open the side panel on this page.')
    }
  }, [])

  if (!settings) {
    return (
      <div className="flex h-40 items-center justify-center paper font-data text-xs text-muted-foreground">
        Loading the record…
      </div>
    )
  }

  const needsKey = !settings.apiKey

  return (
    <div
      className={cn(
        'flex flex-col paper',
        inPanel ? 'h-screen' : 'max-h-[600px] min-h-[340px]',
      )}
    >
      {/* masthead */}
      <header className="z-10 flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
        <LitmusMark className="h-3 w-7 shrink-0 text-foreground" markerAt={84} />
        <h1 className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-tight text-foreground">
          AI Fact Checker
        </h1>
        {!inPanel && (
          <Button
            variant="ghost"
            size="icon"
            onClick={openPanel}
            title="Open in side panel (stays open while you use the page)"
            className="shrink-0"
          >
            <PanelRight className="size-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={openOptions} title="Settings" className="shrink-0">
          <SettingsIcon className="size-4" />
        </Button>
      </header>

      {needsKey ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-card">
            <KeyRound className="size-5 text-primary" />
          </span>
          <div>
            <p className="font-display text-sm font-bold">Add your Claude key</p>
            <p className="mx-auto mt-1.5 max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
              Checks run from your browser with your own key. Nothing routes through a server.
            </p>
          </div>
          <Button onClick={openOptions} size="sm">
            Open settings
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* tabs */}
          <div className="flex shrink-0 gap-1 border-b border-border px-3 pt-2">
            <TabBtn icon={ListChecks} label="Feed" active={tab === 'feed'} onClick={() => setTab('feed')} />
            <TabBtn icon={FolderUp} label="Assets" active={tab === 'assets'} onClick={() => setTab('assets')} />
            <TabBtn icon={Gauge} label="Sentiment" active={tab === 'sentiment'} onClick={() => setTab('sentiment')} />
          </div>

          {tab === 'assets' ? (
            <AssetsPanel settings={settings} />
          ) : tab === 'sentiment' ? (
            <SentimentPanel settings={settings} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
          {/* data strip */}
          <div className="mx-3 mt-3 grid shrink-0 grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card">
            <Stat label="Checked" value={metrics.total} />
            <Stat label="Verified" value={metrics.acc} suffix="%" />
            <Stat label="Flagged" value={metrics.flagged} />
          </div>

          {/* controls */}
          <div className="grid shrink-0 grid-cols-2 gap-2 p-3">
            <Button onClick={toggleListen} variant={listen.listening ? 'destructive' : 'default'}>
              {listen.listening ? <Square className="size-4" /> : <Mic className="size-4" />}
              {listen.listening ? 'Stop' : 'Listen'}
            </Button>
            <Button variant="outline" onClick={scanPage} disabled={busy}>
              <ScanText className="size-4" />
              {busy ? 'Scanning…' : 'Scan page'}
            </Button>
          </div>

          {listen.listening && (
            <div className="mx-3 mb-2 rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-1.5 font-data text-[10px] uppercase tracking-wider text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                {listen.status ?? 'Listening'}
              </div>
              {listen.heard || listen.partial ? (
                <p className="mt-1.5 max-h-16 overflow-y-auto text-xs leading-relaxed text-muted-foreground">
                  {listen.heard}
                  {listen.partial && <span className="italic text-foreground/60"> {listen.partial}</span>}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Play the video in this tab. The transcript shows here.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mx-3 mb-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="size-3.5 text-[hsl(var(--danger))]" />
                <span className="font-data text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--danger))]">
                  Something went wrong
                </span>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Dismiss"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{error}</p>
            </div>
          )}

          {/* source sub-tabs: text vs live audio */}
          <div className="flex items-center gap-1 px-3 pb-1.5 pt-1">
            <FeedTabBtn
              icon={ScanText}
              label="Text"
              count={textFacts.length}
              active={feedTab === 'text'}
              onClick={() => setFeedTab('text')}
            />
            <FeedTabBtn
              icon={Mic}
              label="Audio"
              count={audioFacts.length}
              live={listen.listening}
              active={feedTab === 'audio'}
              onClick={() => setFeedTab('audio')}
            />
            {history.length > 0 && (
              <div className="ml-auto flex items-center gap-1.5">
                <div className="relative">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    aria-label="Sort facts"
                    className="h-7 cursor-pointer appearance-none rounded-md border border-border bg-card pl-2 pr-6 font-data text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                </div>
                <button
                  onClick={() => {
                    clearHistory()
                    setHistory([])
                  }}
                  className="font-data text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-[hsl(var(--danger))]"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* feed — active lane only */}
          <div className="flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
            {feedTab === 'text' ? (
              textFacts.length > 0 ? (
                textFacts.map((v) => <VerdictCard key={v.id} v={v} />)
              ) : (
                <FeedEmpty
                  title="No text checks yet"
                  hint="Highlight a claim, scan a page, or check an uploaded asset."
                />
              )
            ) : audioFacts.length > 0 ? (
              audioFacts.map((v) => <VerdictCard key={v.id} v={v} />)
            ) : (
              <FeedEmpty
                title={listen.listening ? 'Listening for claims…' : 'No audio checks yet'}
                hint={
                  listen.listening
                    ? 'Play a video in this tab — verdicts land here as they’re spoken.'
                    : 'Hit Listen, then play any video. Spoken claims get checked live.'
                }
              />
            )}
          </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { createRoot } from 'react-dom/client'
import { useEffect, useState, useCallback, useRef } from 'react'
import overlayCss from './overlay.css?inline'
import { send } from '@/lib/messaging'

function extractPageText(): string {
  const pick = document.querySelector('article') || document.querySelector('main') || document.body
  return ((pick as HTMLElement)?.innerText ?? '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 9000)
}

/** the litmus mark: a mini false→true scale, the product's signature */
function LitmusGlyph() {
  return (
    <svg className="vt-sel-ic" viewBox="0 0 28 12" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="vt-litmus" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fb7185" />
          <stop offset="0.5" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <rect x="0" y="4" width="28" height="4" rx="2" fill="url(#vt-litmus)" />
      <rect x="21.4" y="0.5" width="2.2" height="11" rx="1.1" fill="#ffffff" />
    </svg>
  )
}

/** Full-page "scanning the page" sweep — runs while a page scan is in flight. */
function ScanFx({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="vt-scan" aria-hidden="true">
      <div className="vt-scan-grid" />
      <div className="vt-scan-beam" />
      <div className="vt-scan-corner tl" />
      <div className="vt-scan-corner tr" />
      <div className="vt-scan-corner bl" />
      <div className="vt-scan-corner br" />
      <div className="vt-scan-chip">
        <LitmusGlyph />
        <span>Scanning page<span className="vt-scan-dots" /></span>
      </div>
    </div>
  )
}

/**
 * On-page footprint is now just the selection toolbar.
 * Verdicts no longer render in a floating panel — they open in the extension UI.
 */
function Selector() {
  const [sel, setSel] = useState<{ x: number; y: number; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const autoScanned = useRef(false)
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // popup tells us when a page scan starts/stops → run the on-page sweep
  useEffect(() => {
    const onMsg = (msg: { type?: string; on?: boolean }) => {
      if (msg?.type !== 'SCAN_FX') return
      if (scanTimer.current) clearTimeout(scanTimer.current)
      if (msg.on) {
        setScanning(true)
        // safety: never let the overlay get stuck if the "off" never lands
        scanTimer.current = setTimeout(() => setScanning(false), 30000)
      } else {
        setScanning(false)
      }
    }
    chrome.runtime.onMessage.addListener(onMsg)
    return () => chrome.runtime.onMessage.removeListener(onMsg)
  }, [])

  // auto-scan the article once on load (results open in the extension UI).
  // The content script never reads the API key — it asks the background whether
  // auto-scan is enabled and only then extracts page text to send for checking.
  useEffect(() => {
    send({ type: 'AUTOSCAN_QUERY' }).then((r) => {
      if (r.ok && r.autoScan && !autoScanned.current) {
        autoScanned.current = true
        const text = extractPageText()
        if (text.length > 200) {
          send({ type: 'FACTCHECK_TEXT', text, source: 'article', pageUrl: location.href })
        }
      }
    })
  }, [])

  // show the pill when there's a meaningful selection
  useEffect(() => {
    const onUp = () => {
      const s = window.getSelection()
      const text = s?.toString().trim() ?? ''
      if (text.length < 15 || !s || s.rangeCount === 0) {
        setSel(null)
        return
      }
      const rect = s.getRangeAt(0).getBoundingClientRect()
      setSel({ x: rect.left + rect.width / 2, y: rect.top - 6, text })
    }
    const onDown = (e: MouseEvent) => {
      // clicks inside our own UI shouldn't dismiss the pill
      if ((e.target as HTMLElement)?.closest?.('#veritas-overlay-host')) return
      setSel(null)
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])

  const check = useCallback(async () => {
    if (!sel) return
    setBusy(true)
    const res = await send({
      type: 'FACTCHECK_TEXT',
      text: sel.text,
      source: 'selection',
      pageUrl: location.href,
    })
    setBusy(false)
    setSel(null)
    if (!res.ok) {
      setNote(res.error)
      // reload errors need a deliberate refresh — keep them until dismissed
      if (!/reload|refresh this page/i.test(res.error)) {
        setTimeout(() => setNote(null), 5000)
      }
    }
  }, [sel])

  const needsRefresh = !!note && /reload|refresh this page/i.test(note)

  return (
    <>
      <ScanFx active={scanning} />

      {sel && (
        <div className="vt-sel-wrap" style={{ left: sel.x, top: sel.y }}>
          <button
            className="vt-sel"
            onClick={check}
            disabled={busy}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <LitmusGlyph />
            <span className={`vt-sel-label${busy ? ' busy' : ''}`}>
              {busy ? 'Checking…' : 'Fact-check'}
            </span>
          </button>
        </div>
      )}

      {note && (
        <div className="vt-toast" role="alert">
          <div className="vt-toast-head">
            <LitmusGlyph />
            <span className="vt-toast-brand">AI Fact Checker</span>
            <button className="vt-toast-x" onClick={() => setNote(null)} title="Dismiss">
              ✕
            </button>
          </div>
          <div className="vt-toast-title">
            {needsRefresh ? 'Extension reloaded' : "Couldn't check that"}
          </div>
          <div className="vt-toast-msg">{note}</div>
          {needsRefresh && (
            <button className="vt-toast-btn" onClick={() => location.reload()}>
              Refresh page
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ── mount into an isolated shadow root ───────────────────────────────────────
function mount() {
  if (document.getElementById('veritas-overlay-host')) return
  const host = document.createElement('div')
  host.id = 'veritas-overlay-host'
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = overlayCss
  shadow.appendChild(style)
  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)
  createRoot(mountPoint).render(<Selector />)
}

if (document.contentType === 'text/html' || !document.contentType) {
  mount()
}

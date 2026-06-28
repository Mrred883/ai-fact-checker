import { useEffect, useState } from 'react'
import { Eye, EyeOff, Check, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select } from '@/components/ui/select'
import { LitmusMark } from '@/components/LitmusMark'
import { applyTheme } from '@/lib/theme'
import { getSettings, saveSettings } from '@/lib/storage'
import { callClaude } from '@/lib/anthropic'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types'

type KeyStatus = 'idle' | 'testing' | 'ok' | 'bad'

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <p className="font-data text-[9px] uppercase tracking-[0.18em] text-primary">{kicker}</p>
      <h2 className="mt-1 font-display text-base font-bold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="w-full shrink-0 sm:w-auto">{children}</div>
    </div>
  )
}

export function Options() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showDg, setShowDg] = useState(false)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('idle')
  const [keyMsg, setKeyMsg] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    getSettings().then((v) => {
      setS(v)
      applyTheme(v.theme)
      setLoaded(true)
    })
  }, [])

  function patch(p: Partial<Settings>) {
    const next = { ...s, ...p }
    setS(next)
    if (p.theme) applyTheme(p.theme)
    saveSettings(p).then(() => {
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1200)
    })
    if ('apiKey' in p) setKeyStatus('idle')
  }

  async function testKey() {
    setKeyStatus('testing')
    setKeyMsg('')
    try {
      await callClaude({
        apiKey: s.apiKey,
        model: s.model,
        system: 'Reply with the single word: ok',
        user: 'ping',
        webSearch: false,
        maxTokens: 16,
      })
      setKeyStatus('ok')
      setKeyMsg('Key works.')
    } catch (e: any) {
      setKeyStatus('bad')
      setKeyMsg(e?.message ?? 'Failed')
    }
  }

  if (!loaded) return null

  return (
    <div className="min-h-screen paper text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex items-center gap-3">
          <LitmusMark className="h-4 w-9 shrink-0 text-foreground" markerAt={84} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight sm:text-2xl">
              AI Fact Checker
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Web-grounded fact-checking that runs with your own Claude key
            </p>
          </div>
          {savedFlash && (
            <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 font-data text-[10px] uppercase tracking-wider text-primary">
              <Check className="size-3.5" /> Saved
            </span>
          )}
        </header>

        <div className="space-y-5">
          {/* API KEY */}
          <Section kicker="Credentials" title="Claude API key">
            <p className="-mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
              Get one at{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              >
                console.anthropic.com <ExternalLink className="size-3" />
              </a>
              . Stored locally in your browser only.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={s.apiKey}
                  onChange={(e) => patch({ apiKey: e.target.value.trim() })}
                  placeholder="sk-ant-…"
                  spellCheck={false}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-9 font-mono text-sm shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button
                variant="outline"
                onClick={testKey}
                disabled={!s.apiKey || keyStatus === 'testing'}
                className="h-10 sm:w-24"
              >
                {keyStatus === 'ok' ? (
                  <Check className="size-4" style={{ color: 'var(--vf-true)' }} />
                ) : keyStatus === 'bad' ? (
                  <X className="size-4" style={{ color: 'var(--vf-false)' }} />
                ) : null}
                {keyStatus === 'testing' ? 'Testing…' : 'Test'}
              </Button>
            </div>
            {keyMsg && (
              <p
                className="mt-2 font-data text-xs"
                style={{ color: keyStatus === 'ok' ? 'var(--vf-true)' : 'var(--vf-false)' }}
              >
                {keyMsg}
              </p>
            )}
          </Section>

          {/* ENGINE */}
          <Section kicker="Engine" title="Model and checking">
            <div className="divide-y divide-border">
              <Row label="Model" hint="Sonnet for fast live use, Opus for depth.">
                <Select
                  className="w-full sm:w-56"
                  value={s.model}
                  onChange={(v) => patch({ model: v as Settings['model'] })}
                  options={[
                    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (fast)' },
                    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (best)' },
                    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (cheapest)' },
                  ]}
                />
              </Row>
              <Row label="Sensitivity" hint="How aggressively claims are flagged for checking.">
                <Select
                  className="w-full sm:w-56"
                  value={s.sensitivity}
                  onChange={(v) => patch({ sensitivity: v as Settings['sensitivity'] })}
                  options={[
                    { value: 'conservative', label: 'Conservative' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'aggressive', label: 'Aggressive' },
                  ]}
                />
              </Row>
              <Row label="Max web searches" hint="Per fact-check batch. Higher is more thorough, slower, pricier.">
                <Select
                  className="w-full sm:w-28"
                  value={String(s.maxSearches)}
                  onChange={(v) => patch({ maxSearches: Number(v) })}
                  options={[3, 5, 8, 10].map((n) => ({ value: String(n), label: String(n) }))}
                />
              </Row>
              <Row label="Theme">
                <Select
                  className="w-full sm:w-40"
                  value={s.theme}
                  onChange={(v) => patch({ theme: v as Settings['theme'] })}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </Row>
            </div>
          </Section>

          {/* PAGE */}
          <Section kicker="On the page" title="Reading">
            <Row
              label="Auto-scan articles"
              hint="Fact-check the main text automatically when a page loads; results open in the extension."
            >
              <Switch checked={s.autoScan} onCheckedChange={(v) => patch({ autoScan: v })} />
            </Row>
          </Section>

          {/* LIVE AUDIO */}
          <Section kicker="Listening" title="Live audio">
            <p className="-mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
              Listen captures the playing tab's audio (YouTube, podcasts, streams) and transcribes it live with
              Deepgram, then fact-checks the claims. No microphone, no speakers needed. Get a free key at{' '}
              <a
                href="https://console.deepgram.com/signup"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              >
                deepgram.com <ExternalLink className="size-3" />
              </a>
              . Stored locally in your browser only.
            </p>
            <div className="relative">
              <input
                type={showDg ? 'text' : 'password'}
                value={s.deepgramKey}
                onChange={(e) => patch({ deepgramKey: e.target.value.trim() })}
                placeholder="Deepgram API key"
                spellCheck={false}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-9 font-mono text-sm shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowDg((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showDg ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <div className="mt-3">
              <Row label="Language" hint="Spoken language of the audio you're checking.">
                <Select
                  className="w-full sm:w-48"
                  value={s.lang}
                  onChange={(v) => patch({ lang: v })}
                  options={[
                    { value: 'en-US', label: 'English (US)' },
                    { value: 'en-GB', label: 'English (UK)' },
                    { value: 'es-ES', label: 'Spanish' },
                    { value: 'fr-FR', label: 'French' },
                    { value: 'de-DE', label: 'German' },
                    { value: 'hi-IN', label: 'Hindi' },
                    { value: 'pt-BR', label: 'Portuguese (BR)' },
                  ]}
                />
              </Row>
            </div>
          </Section>
        </div>

        <p className="mt-8 text-center font-data text-[11px] text-muted-foreground">
          AI Fact Checker v0.1 · Verdicts can be wrong or outdated. Verify anything important yourself.
        </p>
      </div>
    </div>
  )
}

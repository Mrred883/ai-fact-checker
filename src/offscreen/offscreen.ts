import type { Msg } from '@/lib/messaging'

/**
 * Captures the target tab's audio (chrome.tabCapture stream id minted in the
 * background), keeps it audible, and streams raw 16 kHz PCM to Deepgram's
 * realtime API over a WebSocket. Transcripts are posted back to the background,
 * which buffers and fact-checks them. No microphone involved.
 */

let ws: WebSocket | null = null
let tabStream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let processor: ScriptProcessorNode | null = null
let keepAlive: ReturnType<typeof setInterval> | null = null
let meterTimer: ReturnType<typeof setInterval> | null = null
let running = false
let gotSpeech = false
let peak = 0 // rolling peak amplitude, for the level meter

function post(msg: Msg) {
  chrome.runtime.sendMessage(msg).catch(() => {})
}
function status(s: string) {
  post({ type: 'AUDIO_STATUS', status: s })
}
function fail(error: string) {
  post({ type: 'AUDIO_ERROR', error })
}

const DG_LANG: Record<string, string> = {
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  'es-ES': 'es',
  'fr-FR': 'fr',
  'de-DE': 'de',
  'hi-IN': 'hi',
  'pt-BR': 'pt-BR',
}

/** Downsample a Float32 frame from inRate to 16 kHz and pack as 16-bit LE PCM. */
function toPcm16k(input: Float32Array, inRate: number): ArrayBuffer {
  if (inRate === 16000) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out.buffer
  }
  const ratio = inRate / 16000
  const outLen = Math.floor(input.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.floor((i + 1) * ratio)
    let sum = 0
    let c = 0
    for (let j = start; j < end && j < input.length; j++) {
      sum += input[j]
      c++
    }
    let s = c ? sum / c : input[start] || 0
    s = Math.max(-1, Math.min(1, s))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

async function start(streamId: string, key: string, lang: string) {
  if (running) return
  running = true
  gotSpeech = false
  peak = 0
  status('Starting…')

  if (!key) {
    fail('Missing Deepgram key. Add it in settings.')
    running = false
    return
  }

  // 1. grab the tab's audio
  try {
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
      },
      video: false,
    } as unknown as MediaStreamConstraints)
  } catch (e: any) {
    fail(`Could not capture this tab's audio: ${e?.message ?? e}`)
    running = false
    return
  }
  if (!tabStream.getAudioTracks().length) {
    fail('This tab has no audio track to capture.')
    stop()
    return
  }
  status('Capturing tab audio')

  // 2. one native-rate context: play to speakers AND tap for PCM
  audioCtx = new AudioContext()
  const inRate = audioCtx.sampleRate
  const source = audioCtx.createMediaStreamSource(tabStream)
  source.connect(audioCtx.destination) // keep the tab audible

  // 3. open Deepgram realtime socket for raw 16 kHz mono PCM
  const params = new URLSearchParams({
    model: 'nova-2',
    language: DG_LANG[lang] ?? lang.split('-')[0] ?? 'en',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    smart_format: 'true',
    interim_results: 'true',
    punctuate: 'true',
    endpointing: '300',
  })
  try {
    ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['token', key])
  } catch (e: any) {
    fail(`Deepgram connection failed: ${e?.message ?? e}`)
    stop()
    return
  }
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    status('Listening')
    processor = audioCtx!.createScriptProcessor(4096, 1, 1)
    const mute = audioCtx!.createGain()
    mute.gain.value = 0
    source.connect(processor)
    processor.connect(mute)
    mute.connect(audioCtx!.destination)
    processor.onaudioprocess = (e) => {
      const buf = e.inputBuffer.getChannelData(0)
      for (let i = 0; i < buf.length; i += 128) {
        const a = Math.abs(buf[i])
        if (a > peak) peak = a
      }
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(toPcm16k(buf, inRate))
    }
    keepAlive = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
    }, 8000)
    // level meter until the first transcript arrives — tells us audio is really flowing
    meterTimer = setInterval(() => {
      if (gotSpeech) return
      const lvl = Math.round(peak * 100)
      peak = 0
      status(lvl >= 2 ? `Listening · audio ${lvl}%` : 'Listening · no audio from tab yet')
    }, 1500)
  }

  ws.onmessage = (ev) => {
    let data: any
    try {
      data = JSON.parse(ev.data)
    } catch {
      return
    }
    if (data.type && data.type !== 'Results') return // ignore Metadata/SpeechStarted/etc
    const text: string = data.channel?.alternatives?.[0]?.transcript ?? ''
    if (!text.trim()) return
    if (!gotSpeech) {
      gotSpeech = true
      if (meterTimer) {
        clearInterval(meterTimer)
        meterTimer = null
      }
      status('Transcribing…')
    }
    post({ type: 'TRANSCRIPT', text, final: Boolean(data.is_final) })
  }

  ws.onerror = () => {
    fail('Deepgram socket error. Check that your Deepgram key is valid.')
  }

  ws.onclose = (ev) => {
    if (running && ev.code !== 1000) {
      fail(
        `Deepgram closed the connection (${ev.code}${ev.reason ? ': ' + ev.reason : ''}). ` +
          'Usually an invalid key or exhausted quota.',
      )
      running = false
    }
  }
}

function stop() {
  running = false
  for (const t of [keepAlive, meterTimer]) if (t) clearInterval(t)
  keepAlive = null
  meterTimer = null
  if (processor) {
    processor.onaudioprocess = null
    try {
      processor.disconnect()
    } catch {
      /* ignore */
    }
    processor = null
  }
  if (ws) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }))
    } catch {
      /* ignore */
    }
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    ws = null
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {})
    audioCtx = null
  }
  if (tabStream) {
    tabStream.getTracks().forEach((t) => t.stop())
    tabStream = null
  }
}

chrome.runtime.onMessage.addListener((msg: Msg) => {
  if (msg.type === 'OFFSCREEN_START') void start(msg.streamId, msg.deepgramKey, msg.lang)
  else if (msg.type === 'OFFSCREEN_STOP') stop()
})

// tell the background the listener is registered (avoids racing the script load)
post({ type: 'OFFSCREEN_READY' })

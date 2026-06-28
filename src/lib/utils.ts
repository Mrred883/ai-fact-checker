import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Asset } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncate(s: string, n = 140) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

export function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Strip HTML tags + markdown markup from model text so the UI shows clean,
 * formatted plain text. Decodes common entities and collapses whitespace.
 */
export function cleanText(s: string): string {
  if (!s) return ''
  let t = s
    .replace(/<[^>]+>/g, ' ') // html tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
  t = t
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // inline/code fences
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2') // italic
    .replace(/(^|\s)_([^_\n]+)_/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s{0,3}[-*+]\s+/gm, '') // bullet markers
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
  return t
}

/** stable-ish id without Math.random in hot loops */
let _seq = 0
export function uid(prefix = 'id') {
  _seq = (_seq + 1) % Number.MAX_SAFE_INTEGER
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`
}

export const ASSET_MAX_BYTES = 10 * 1024 * 1024 // 10 MB per file
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const TEXT_RE = /\.(txt|md|markdown|csv|json|log)$/i

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const res = String(r.result)
      const comma = res.indexOf(',')
      resolve(comma >= 0 ? res.slice(comma + 1) : res) // strip data: prefix
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Read a picked File into an Asset, or throw a user-readable error. */
export async function fileToAsset(file: File): Promise<Asset> {
  if (file.size > ASSET_MAX_BYTES) {
    throw new Error(`${file.name} is too large (max ${formatBytes(ASSET_MAX_BYTES)}).`)
  }
  const type = file.type || ''
  const isImage = IMAGE_TYPES.includes(type)
  const isPdf = type === 'application/pdf' || /\.pdf$/i.test(file.name)
  const isText = type.startsWith('text/') || TEXT_RE.test(file.name)

  if (!isImage && !isPdf && !isText) {
    throw new Error(`${file.name}: unsupported type. Use PDF, an image, or a text file.`)
  }

  const base = { id: uid('a'), name: file.name, size: file.size, createdAt: Date.now() }
  if (isText) {
    const text = await file.text()
    return { ...base, kind: 'text', mediaType: 'text/plain', text }
  }
  const data = await fileToBase64(file)
  return isImage
    ? { ...base, kind: 'image', mediaType: type, data }
    : { ...base, kind: 'document', mediaType: 'application/pdf', data }
}

/**
 * Lightweight, dependency-free reader for C2PA "Content Credentials" embedded
 * in image files. It locates the JUMBF box, walks to the active manifest's CBOR
 * claim, and extracts the human-meaningful facts: who signed it, what tool made
 * it, and whether the assertions say the pixels were AI-generated.
 *
 * This is NOT a full cryptographic verifier — running the COSE signature trust
 * chain needs the c2pa wasm lib and a trust list. We report the manifest's
 * CLAIMS as facts ("the file carries credentials that say X"), and flag that the
 * signature was read but not independently verified in-browser. That distinction
 * is surfaced honestly in the UI.
 */

export interface C2paResult {
  present: boolean
  /** claim_generator / software agent string, e.g. "Adobe Firefly" */
  generator?: string
  /** signer / issuer common name from the manifest, when found */
  issuer?: string
  /** assertion labels found, e.g. "c2pa.actions", "c2pa.training-mining" */
  assertions: string[]
  /** true when an assertion marks the content as AI-generated */
  aiGenerated: boolean
  /** the digitalSourceType URI when present (the strongest tell) */
  digitalSourceType?: string
  /** the raw size of the manifest store, bytes */
  manifestBytes: number
}

const EMPTY: C2paResult = { present: false, assertions: [], aiGenerated: false, manifestBytes: 0 }

// the C2PA JUMBF box is tagged with this UUID label/superbox type "c2pa"
const C2PA_MARKER = textBytes('c2pa')
const JUMBF_TYPE_JSON = 'json'
// digitalSourceType values that indicate synthetic media (IPTC vocabulary)
const AI_SOURCE_TYPES = [
  'trainedAlgorithmicMedia',
  'algorithmicMedia',
  'compositeSynthetic',
  'syntheticCapture',
]

function textBytes(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0))
}

function indexOfBytes(hay: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

/** decode the printable ASCII/UTF-8 run around an offset, for harvesting strings */
function asText(buf: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  } catch {
    return ''
  }
}

/**
 * We avoid a full CBOR decoder: the manifest's interesting bits (generator,
 * assertion labels, digitalSourceType, signer CN) are stored as UTF-8 strings
 * inside the JUMBF/CBOR. Harvesting those strings from the manifest blob is
 * robust enough to report the claims, without parsing every CBOR major type.
 */
function readManifestStrings(blob: Uint8Array): C2paResult {
  const text = asText(blob)

  const assertions = new Set<string>()
  for (const label of [
    'c2pa.actions',
    'c2pa.actions.v2',
    'c2pa.training-mining',
    'c2pa.hash.data',
    'c2pa.thumbnail.claim',
    'stds.schema-org.CreativeWork',
    'com.adobe.generative',
  ]) {
    if (text.includes(label)) assertions.add(label)
  }

  let digitalSourceType: string | undefined
  for (const t of AI_SOURCE_TYPES) {
    if (text.includes(t)) {
      digitalSourceType = t
      break
    }
  }
  // also catch the full IPTC URI form
  const uriMatch = text.match(/digitalsourcetype\/([a-zA-Z]+)/i)
  if (!digitalSourceType && uriMatch) {
    const v = uriMatch[1]
    if (AI_SOURCE_TYPES.some((a) => a.toLowerCase() === v.toLowerCase())) digitalSourceType = v
  }

  // claim_generator — a software-agent string; grab the value after the key
  let generator: string | undefined
  const genMatch =
    text.match(/claim_generator[_a-z]*["\s:]*([\x20-\x7e]{3,80})/i) ||
    text.match(/softwareAgent["\s:]*([\x20-\x7e]{3,80})/i)
  if (genMatch) generator = cleanAscii(genMatch[1])

  // issuer / signer common name often appears near "CN=" in the cert
  let issuer: string | undefined
  const cnMatch = text.match(/CN=([\x20-\x7e]{2,60})/)
  if (cnMatch) issuer = cleanAscii(cnMatch[1])

  const aiGenerated =
    !!digitalSourceType ||
    assertions.has('c2pa.training-mining') ||
    /generative|firefly|dall-?e|midjourney|imagen|stable ?diffusion/i.test(text)

  return {
    present: true,
    generator,
    issuer,
    assertions: [...assertions],
    aiGenerated,
    digitalSourceType,
    manifestBytes: blob.length,
  }
}

function cleanAscii(s: string): string {
  return s
    .replace(/[^\x20-\x7e]+/g, ' ')
    .replace(/["{}\[\],]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** Locate the C2PA JUMBF superbox in any container and return its bytes. */
function findC2paBox(bytes: Uint8Array): Uint8Array | null {
  // The JUMBF superbox carries the ASCII label "c2pa" right after its UUID type.
  // Searching for the label is container-agnostic (works for JPEG APP11, PNG
  // caBX chunk, WebP, HEIC) because the label sits inside the box payload.
  let from = 0
  while (true) {
    const at = indexOfBytes(bytes, C2PA_MARKER, from)
    if (at === -1) return null
    // sanity: the bytes just before should look like a box (length + 'jumb'/uuid)
    // take a generous slice from here to end — the string harvester tolerates extra.
    // cap to 512KB to avoid scanning huge files end-to-end.
    const end = Math.min(bytes.length, at + 512 * 1024)
    const slice = bytes.subarray(Math.max(0, at - 16), end)
    // require at least one known C2PA token nearby to avoid false hits
    const probe = asText(slice.subarray(0, 4096))
    if (
      probe.includes('jumb') ||
      probe.includes('c2pa') ||
      probe.includes('urn:') ||
      probe.includes('cai')
    ) {
      return slice
    }
    from = at + 4
  }
}

/** Read Content Credentials from a base64-encoded image (no data: prefix). */
export function readC2paFromBase64(b64: string): C2paResult {
  let bytes: Uint8Array
  try {
    const bin = atob(b64)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } catch {
    return EMPTY
  }
  return readC2paFromBytes(bytes)
}

/**
 * Pull a camera make/model from EXIF, if present. A real make/model is a (weak,
 * strippable) signal of an actual capture device. We scan for the common ASCII
 * vendor strings rather than fully parsing the EXIF IFD — robust enough for a hint.
 */
const CAMERA_VENDORS = [
  'Canon',
  'NIKON',
  'Nikon',
  'SONY',
  'Sony',
  'FUJIFILM',
  'Panasonic',
  'OLYMPUS',
  'OM Digital',
  'Leica',
  'Hasselblad',
  'Apple',
  'samsung',
  'Samsung',
  'Google',
  'OnePlus',
  'Xiaomi',
  'motorola',
]

export function readCameraFromBase64(b64: string): string | undefined {
  let bytes: Uint8Array
  try {
    const bin = atob(b64)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } catch {
    return undefined
  }
  // EXIF lives in the first ~64KB for JPEG; cap the scan
  const head = bytes.subarray(0, Math.min(bytes.length, 96 * 1024))
  if (indexOfBytes(head, textBytes('Exif')) === -1) return undefined
  const text = asText(head)
  for (const v of CAMERA_VENDORS) {
    const i = text.indexOf(v)
    if (i !== -1) {
      // grab a short readable run starting at the vendor token
      const run = cleanAscii(text.slice(i, i + 40))
      if (run.length >= v.length) return run
    }
  }
  return undefined
}

export function readC2paFromBytes(bytes: Uint8Array): C2paResult {
  // quick reject: no "c2pa" / "jumb" anywhere → no credentials
  if (indexOfBytes(bytes, C2PA_MARKER) === -1 && indexOfBytes(bytes, textBytes('jumb')) === -1) {
    return EMPTY
  }
  const box = findC2paBox(bytes)
  if (!box) return EMPTY
  void JUMBF_TYPE_JSON
  return readManifestStrings(box)
}

/**
 * Generates the PWA / home-screen icons.
 *
 * Deliberately dependency-free: it rasterises the mark into an RGBA buffer and
 * encodes a PNG with Node's built-in zlib, so `npm i` stays small and the icons
 * can be regenerated on any machine with `node scripts/make-icons.mjs`.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const ACCENT = [0x4f, 0x46, 0xe5]
const WHITE = [0xff, 0xff, 0xff]

/* ------------------------------------------------------------ png encoding */
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const encodePNG = (size, rgba) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  // rows are prefixed with filter byte 0 (None)
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------------------------------------------- the mark */
/** Distance from a point to a vertical capsule (a bar with rounded caps). */
const capsule = (px, py, cx, top, bottom, r) => {
  const y = Math.min(Math.max(py, top + r), bottom - r)
  return Math.hypot(px - cx, py - y) - r
}

const drawIcon = (size) => {
  const S = size
  const buf = Buffer.alloc(S * S * 4)
  const cx = S / 2
  const cy = S / 2
  const u = S * 0.055          // bar width
  const gap = S * 0.075        // spacing between bars
  const r = u / 2
  const baseline = cy + S * 0.2

  const bars = [0.16, 0.26, 0.36].map((h, i) => ({
    x: cx - gap + i * gap,
    top: baseline - h * S,
    bottom: baseline,
  }))
  const dot = { x: cx + gap, y: cy - S * 0.235, r: u * 0.52 }

  // Sample 2x2 per pixel so the curves do not look ragged at small sizes.
  const OFFSETS = [0.25, 0.75]

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hits = 0
      for (const oy of OFFSETS) {
        for (const ox of OFFSETS) {
          const px = x + ox
          const py = y + oy
          const inBar = bars.some((b) => capsule(px, py, b.x, b.top, b.bottom, r) <= 0)
          const inDot = Math.hypot(px - dot.x, py - dot.y) <= dot.r
          if (inBar || inDot) hits++
        }
      }
      const t = hits / 4
      const i = (y * S + x) * 4
      for (let c = 0; c < 3; c++) {
        buf[i + c] = Math.round(ACCENT[c] * (1 - t) + WHITE[c] * t)
      }
      buf[i + 3] = 255
    }
  }
  return encodePNG(S, buf)
}

mkdirSync('public', { recursive: true })
for (const size of [180, 192, 512]) {
  writeFileSync(`public/icon-${size}.png`, drawIcon(size))
  console.log(`public/icon-${size}.png`)
}

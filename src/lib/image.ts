/**
 * Turns a picked image file into a small square data URL suitable for storing
 * in settings.
 *
 * The result is carried in localStorage and pushed through cloud sync, so a
 * 6MB phone photo cannot go in as-is: it is centre-cropped to a square,
 * resized, and re-encoded to roughly 15-30kB.
 */

export const AVATAR_SIZE = 256
const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_RESULT_CHARS = 400_000

/** Decode a file, honouring EXIF orientation where the browser supports it. */
const decode = async (file: File): Promise<CanvasImageSource & { width: number; height: number }> => {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* Safari < 15 and friends — fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('That image could not be read.'))
      img.src = url
    })
  } finally {
    // Safe to revoke once decoding has finished; the bitmap is already drawn.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/** Prefer WebP (small, keeps transparency); fall back for older browsers. */
const encode = (canvas: HTMLCanvasElement): string => {
  const webp = canvas.toDataURL('image/webp', 0.9)
  if (webp.startsWith('data:image/webp')) return webp

  const png = canvas.toDataURL('image/png')
  if (png.length < MAX_RESULT_CHARS) return png

  // Last resort: JPEG has no alpha, so flatten onto white first.
  const flat = document.createElement('canvas')
  flat.width = canvas.width
  flat.height = canvas.height
  const ctx = flat.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, flat.width, flat.height)
  ctx.drawImage(canvas, 0, 0)
  return flat.toDataURL('image/jpeg', 0.85)
}

export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is over 15MB — try a smaller one.')
  }

  const source = await decode(file)
  const side = Math.min(source.width, source.height)
  if (!side) throw new Error('That image could not be read.')

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process images.')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Centre-crop to a square, then scale down in one step.
  ctx.drawImage(
    source,
    (source.width - side) / 2,
    (source.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  )

  if ('close' in source && typeof source.close === 'function') source.close()

  const result = encode(canvas)
  if (result.length > MAX_RESULT_CHARS) {
    throw new Error('That image is too detailed to store — try a simpler one.')
  }
  return result
}

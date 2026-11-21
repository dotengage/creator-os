/**
 * Blocks every touch zoom gesture on phones and tablets.
 *
 * Three layers are needed because no single one covers every browser:
 *
 *   1. The viewport meta (`maximum-scale=1, user-scalable=no`) stops Android
 *      Chrome. iOS Safari has ignored it since iOS 10.
 *   2. `touch-action: pan-x pan-y` on the body drops pinch and double-tap while
 *      leaving ordinary scrolling alone. Honoured by Chrome and, partly, Safari.
 *   3. The handlers below are what actually stop iOS: WebKit raises its own
 *      non-standard `gesture*` events for pinch, and they must be cancelled
 *      directly. The two-finger `touchmove` guard catches what slips past.
 *
 * Desktop zoom (ctrl/cmd + scroll, the browser's zoom menu) is untouched —
 * only touch gestures are suppressed.
 */

type GestureEvent = Event & { scale?: number }

export function blockTouchZoom(): () => void {
  const stop = (e: Event) => e.preventDefault()

  // iOS/WebKit pinch. Not in the DOM typings, hence the string names.
  const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend'] as const
  for (const name of gestureEvents) {
    document.addEventListener(name, stop as EventListener, { passive: false })
  }

  // Anything multi-touch is a zoom attempt; one finger must still scroll.
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault()
  }
  document.addEventListener('touchmove', onTouchMove, { passive: false })

  // Belt and braces for double-tap on browsers that ignore touch-action.
  let lastTouchEnd = 0
  const onTouchEnd = (e: TouchEvent) => {
    const now = Date.now()
    if (now - lastTouchEnd <= 300) e.preventDefault()
    lastTouchEnd = now
  }
  document.addEventListener('touchend', onTouchEnd, { passive: false })

  // Safari also fires dblclick from a double tap.
  const onDoubleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    // Leave text fields alone: double-click selects a word there.
    if (target?.closest('input, textarea, [contenteditable="true"]')) return
    e.preventDefault()
  }
  document.addEventListener('dblclick', onDoubleClick, { passive: false })

  return () => {
    for (const name of gestureEvents) {
      document.removeEventListener(name, stop as EventListener)
    }
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('dblclick', onDoubleClick)
  }
}

export type { GestureEvent }

// Tiny DOM builder so screens read declaratively without a framework.

export type Child = Node | string | null | undefined | false

export function h(
  tag: string,
  attrs?: Record<string, unknown> | null,
  ...children: Child[]
): HTMLElement {
  const el = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = String(v)
      else if (k === 'html') el.innerHTML = String(v)
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
      } else if (k === 'style') el.setAttribute('style', String(v))
      else el.setAttribute(k, String(v))
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

export function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

export function clear(el: HTMLElement) {
  el.textContent = ''
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** scale a duration down when the user prefers reduced motion */
export function rm(ms: number): number {
  return reducedMotion() ? Math.round(ms * 0.35) : ms
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}

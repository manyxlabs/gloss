type At = { x: number; y: number };

const SLACK = 5;
const STEP = 3;

/**
 * The ink under an eraser moved from one point to another. Pointer events arrive several
 * pixels apart and a pen line is two or three wide, so the whole path is searched, with a
 * little slack around it.
 */
export function inkAlong(from: At, to: At, idOf: (el: Element) => string | undefined) {
  const found = new Set<string>();
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STEP));
  for (let i = 0; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    for (const [dx, dy] of [
      [0, 0],
      [SLACK, 0],
      [-SLACK, 0],
      [0, SLACK],
      [0, -SLACK],
    ] as const)
      for (const el of document.elementsFromPoint(x + dx, y + dy)) {
        const id = idOf(el);
        if (id) found.add(id);
      }
  }
  return found;
}

import type { Fold, Spot } from '../types';

type Stretch = [from: number, to: number];
type PageView = { div: HTMLElement };
type Viewer = {
  pagesCount: number;
  getPageView: (i: number) => PageView;
  viewer: HTMLElement | null;
};

export const before = (a: Spot, b: Spot) => a.page < b.page || (a.page === b.page && a.y < b.y);

/** The parts of a page left in view by the squeezes, as fractions of its height. */
export function stretches(folds: Fold[], page: number): Stretch[] {
  let out: Stretch[] = [[0, 1]];
  for (const f of folds) {
    const a = f.from.page < page ? 0 : f.from.page === page ? f.from.y : 2;
    const b = f.to.page > page ? 1 : f.to.page === page ? f.to.y : -1;
    if (a >= b) continue;
    out = out.flatMap(([s, e]) =>
      (
        [
          [s, Math.min(e, a)],
          [Math.max(s, b), e],
        ] as Stretch[]
      ).filter(([x, y]) => y - x > 0.002),
    );
  }
  return out;
}

/** Fills a tail with a copy of its page, moved up so only the stretch it shows is in view. */
function fill(tail: HTMLElement, div: HTMLElement) {
  const [a, b] = [Number(tail.dataset.from), Number(tail.dataset.to)];
  const copy = div.cloneNode(true) as HTMLElement;
  // Links and form fields would exist twice; the copy is for reading and selecting text.
  copy.querySelectorAll('.annotationLayer, .annotationEditorLayer').forEach((e) => e.remove());
  Object.assign(copy.style, {
    margin: `${-a * div.offsetHeight}px 0 0`,
    clipPath: '',
  });
  Object.assign(copy.dataset, { from: String(a), to: String(b), copy: '' });
  const from = div.querySelectorAll('canvas');
  copy.querySelectorAll('canvas').forEach((c, i) => {
    const s = from[i];
    if (!s?.width) return;
    c.width = s.width;
    c.height = s.height;
    c.getContext('2d')?.drawImage(s, 0, 0);
  });
  tail.replaceChildren(copy);
}

/** Copies a page into the tails that show more of it; called when pdf.js redraws the page or its highlights change. */
export function refreshTails(viewer: Viewer, page: number) {
  const div = viewer.getPageView(page - 1).div;
  viewer.viewer?.querySelectorAll<HTMLElement>(`:scope > .fold-tail[data-page="${page}"]`).forEach((t) => fill(t, div));
}

/**
 * Lays the document out with its squeezes: each page shows its first stretch in place, clipped,
 * with negative margins taking up the space of what is hidden; any further stretch of the same
 * page follows as a copy. A bar marks each squeeze and opens it again.
 */
export function layoutFolds(viewer: Viewer, folds: Fold[], expand: (ids: string[]) => void) {
  const root = viewer.viewer;
  if (!root) return;
  root.querySelectorAll(':scope > .fold-tail, :scope > .fold-bar').forEach((e) => e.remove());
  const pieces: {
    page: number;
    from: number;
    to: number;
    el: HTMLElement;
    width: number;
  }[] = [];
  for (let i = 0; i < viewer.pagesCount; i++) {
    const div = viewer.getPageView(i).div;
    const page = i + 1;
    const h = div.offsetHeight;
    Object.assign(div.style, { marginTop: '', marginBottom: '', clipPath: '' });
    const shown = stretches(folds, page);
    const [first] = shown;
    if (!first) {
      Object.assign(div.style, {
        marginTop: '0px',
        marginBottom: `${-h}px`,
        clipPath: 'inset(0 0 100% 0)',
      });
      Object.assign(div.dataset, { from: '-1', to: '-1' });
      continue;
    }
    const [a, b] = first;
    if (a > 0) div.style.marginTop = `${-a * h}px`;
    if (b < 1) div.style.marginBottom = `${-(1 - b) * h}px`;
    if (a > 0 || b < 1) div.style.clipPath = `inset(${a * 100}% 0 ${(1 - b) * 100}% 0)`;
    Object.assign(div.dataset, { from: String(a), to: String(b) });
    pieces.push({ page, from: a, to: b, el: div, width: div.offsetWidth });
    let last: HTMLElement = div;
    for (const [s, e] of shown.slice(1)) {
      const tail = document.createElement('div');
      tail.className = 'fold-tail';
      Object.assign(tail.dataset, {
        page: String(page),
        from: String(s),
        to: String(e),
      });
      Object.assign(tail.style, {
        height: `${(e - s) * h}px`,
        width: `${div.offsetWidth}px`,
      });
      fill(tail, div);
      last.after(tail);
      last = tail;
      pieces.push({ page, from: s, to: e, el: tail, width: div.offsetWidth });
    }
  }

  const bar = (start: Spot, end: Spot, width: number) => {
    const hidden = end.page - start.page + end.y - start.y;
    const el = document.createElement('button');
    el.className = 'fold-bar';
    el.style.width = `${width}px`;
    el.innerHTML = `<span>${hidden >= 0.95 ? `${Math.round(hidden)} page${Math.round(hidden) === 1 ? '' : 's'} squeezed` : 'Text squeezed'}</span><b>Expand</b>`;
    el.addEventListener('click', () => expand(folds.filter((f) => before(start, f.to) && before(f.from, end)).map((f) => f.id)));
    return el;
  };
  const contiguous = (a: Spot, b: Spot) => (a.page === b.page && Math.abs(a.y - b.y) < 0.003) || (b.page === a.page + 1 && a.y > 0.997 && b.y < 0.003);
  let end: Spot = { page: 1, y: 0 };
  for (const piece of pieces) {
    const start = { page: piece.page, y: piece.from };
    if (!contiguous(end, start)) piece.el.before(bar(end, start, piece.width));
    end = { page: piece.page, y: piece.to };
  }
  const last = pieces.at(-1);
  const close = { page: viewer.pagesCount, y: 1 };
  if (folds.length && (!last || !contiguous(end, close))) (last?.el ?? root.lastElementChild)?.after(bar(end, close, last?.width ?? 600));
}

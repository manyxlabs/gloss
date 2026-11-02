import { outline, PAGE_PIXELS, PAPER, pathOf } from '../../ink';
import { useStore } from '../../store/project';

export type PageView = { id: number; div: HTMLElement };

const SVG = 'http://www.w3.org/2000/svg';

/** The layer of a kind in a page div, made on first use; pdf.js empties the div whenever it redraws the page. */
function layer<T extends Element>(div: HTMLElement, make: () => T, className: string, before: string | null) {
  let el = div.querySelector<T>(`:scope > .${className}`);
  if (!el) {
    el = make();
    el.setAttribute('class', className);
    div.insertBefore(el, before ? div.querySelector(`:scope > ${before}`) : null);
  }
  return el;
}

/** Paints a page's highlights (under the text, so it stays selectable) and handwriting (over it). */
export function paint(view: PageView, flashId: string | null, docId: string | null) {
  const { project } = useStore.getState();
  if (!project) return;
  const excerpted = new Set(project.cards.flatMap((c) => (c.data.kind === 'excerpt' ? [c.data.highlightId] : [])));
  const marks = layer(view.div, () => document.createElement('div'), 'hl-layer', '.textLayer');
  marks.replaceChildren(
    ...project.highlights
      .filter((h) => h.docId === docId)
      .flatMap((h) =>
        h.parts
          .filter((p) => p.page === view.id)
          .flatMap((p) =>
            p.rects.map(([x, y, w, hgt]) => {
              const mark = document.createElement('div');
              mark.className = `hl hl-${h.color}${excerpted.has(h.id) ? ' linked' : ''}${flashId === h.id ? ' flash' : ''}`;
              mark.dataset.id = h.id;
              Object.assign(mark.style, {
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${hgt * 100}%`,
              });
              return mark;
            }),
          ),
      ),
  );

  // Drawn in a fixed number of units across the page, so strokes keep their shape at any zoom,
  // and enough of them that the path's rounding to hundredths does not show.
  const ratio = view.div.offsetHeight / view.div.offsetWidth || 1.294;
  const ink = layer(view.div, () => document.createElementNS(SVG, 'svg'), 'ink-layer', '.annotationLayer');
  ink.setAttribute('viewBox', `0 0 ${PAGE_PIXELS} ${PAGE_PIXELS * ratio}`);
  ink.replaceChildren(
    ...project.inks
      .filter((i) => i.docId === docId && i.page === view.id)
      .map((i) => {
        const path = document.createElementNS(SVG, 'path');
        path.setAttribute(
          'd',
          pathOf(
            outline(
              i.points.map(([x, y, p]) => [x * PAGE_PIXELS, y * ratio * PAGE_PIXELS, p]),
              i.size * PAGE_PIXELS,
              i.pen,
            ),
          ),
        );
        path.setAttribute('fill', PAPER[i.color]);
        path.dataset.inkId = i.id;
        return path;
      }),
  );
}

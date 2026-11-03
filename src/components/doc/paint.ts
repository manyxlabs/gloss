import { fillOf, outline, PAGE_PIXELS, PAPER, pathOf } from '../../ink';
import { cite, commentOf, endsOf } from '../../links';
import { cardText } from '../../search';
import { useLinking } from '../../store/links';
import { TEXT_LINE, TEXT_PAD, useStore } from '../../store/project';
import type { Highlight } from '../../types';
import { paintPhotos } from './photos';

export type PageView = { id: number; div: HTMLElement };

const SVG = 'http://www.w3.org/2000/svg';
/** A marker's height and the least gap between two in one margin, in CSS pixels. */
const MARK = 20;
const MARK_GAP = 3;
/** Lucide's link-2, drawn inside a link's marker. */
const LINK_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>';

/** Moves markers down where they would overlap the one above in the same margin, keeping each as near its line as it can be. */
function spread(marks: HTMLElement[], centres: number[], pageHeight: number) {
  const order = centres.map((c, i) => [c * pageHeight, i] as const).sort((a, b) => a[0] - b[0]);
  let last = -Infinity;
  for (const [px, i] of order) {
    const at = Math.max(px, last + MARK + MARK_GAP);
    marks[i]!.style.top = `${(at / pageHeight) * 100}%`;
    last = at;
  }
}

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

/** The text box chosen, whose toolbar is open, outlined with a handle to resize it. */
let chosenBox: string | null = null;
export function chooseBox(id: string | null) {
  chosenBox = id;
  for (const el of document.querySelectorAll<HTMLElement>('.text-box')) el.classList.toggle('chosen', el.dataset.boxId === id);
}

const pct = (v: number) => `${v * 100}%`;

/** A page's text boxes, changed in place rather than drawn again, so the one being typed in keeps its caret. */
function paintBoxes(layer: HTMLElement, boxes: Highlight[], marks: (h: Highlight) => string) {
  const ids = new Set(boxes.map((h) => h.id));
  for (const el of [...layer.children] as HTMLElement[]) if (!ids.has(el.dataset.boxId!)) el.remove();
  for (const h of boxes) {
    let el = layer.querySelector<HTMLElement>(`:scope > [data-box-id="${h.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.dataset.boxId = h.id;
      Object.assign(el.style, { lineHeight: String(TEXT_LINE), padding: `${TEXT_PAD[1]}em ${TEXT_PAD[0]}em`, color: PAPER.ink });
      const text = document.createElement('div');
      Object.assign(text, { className: 'box-text', role: 'textbox', ariaLabel: 'Text box', ariaMultiLine: 'true' });
      const grip = document.createElement('span');
      grip.className = 'box-grip';
      el.append(text, grip);
      layer.append(el);
    }
    const [x, y, w] = h.parts[0]!.rects[0]!;
    el.className = `text-box hl-${h.color}${h.id === chosenBox ? ' chosen' : ''}${marks(h)}`;
    Object.assign(el.style, { left: pct(x), top: pct(y), width: pct(w), fontSize: `calc(${h.typed!.size} * 100cqw)` });
    const text = el.firstElementChild as HTMLElement;
    if (document.activeElement !== text && text.textContent !== h.text) text.textContent = h.text;
  }
}

/** Paints a page's highlights (under the text, so it stays selectable), handwriting (over it) and text boxes. */
export function paint(view: PageView, flashId: string | null, docId: string | null) {
  const { project } = useStore.getState();
  if (!project) return;
  const { linking } = useLinking.getState();
  const linkingFrom = linking?.kind === 'link' ? linking.from : null;
  const excerpted = new Set(project.cards.flatMap((c) => (c.data.kind === 'excerpt' ? [c.data.highlightId] : [])));
  const states = (h: Highlight) => `${excerpted.has(h.id) ? ' linked' : ''}${flashId === h.id ? ' flash' : ''}${linkingFrom === h.id ? ' linking' : ''}`;
  paintPhotos(view, docId);
  const marks = layer(view.div, () => document.createElement('div'), 'hl-layer', '.textLayer');
  const mine = project.highlights.filter((h) => h.docId === docId);
  marks.replaceChildren(
    ...mine
      .filter((h) => !h.typed)
      .flatMap((h) =>
        h.parts
          .filter((p) => p.page === view.id)
          .flatMap((p) =>
            p.rects.map(([x, y, w, hgt]) => {
              const mark = document.createElement('div');
              mark.className = `hl hl-${h.color}${h.area ? ' area' : ''}${states(h)}`;
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

  // Above the text layer, unlike the highlights, so the markers take clicks; only the highlight's first line gets one.
  // Comments are in the right margin and links in the left, so the two never meet.
  const starting = project.highlights.filter((h) => h.docId === docId && h.parts[0]?.page === view.id);
  const centre = (h: (typeof starting)[number]) => {
    const [, y, , hgt] = h.parts[0]!.rects[0] ?? [0, 0, 0, 0];
    return y + hgt / 2;
  };
  const marker = (kind: string, h: (typeof starting)[number], label: string, title: string) => {
    const mark = document.createElement('button');
    mark.className = `${kind} hl-${h.color}`;
    mark.title = title;
    mark.setAttribute('aria-label', label);
    return mark;
  };
  const commented = starting.flatMap((h) => {
    const comment = commentOf(project, h);
    if (!comment) return [];
    const mark = marker('note-mark', h, `Comment: ${comment.text}`, comment.text);
    mark.dataset.noteId = h.id;
    return [{ h, mark }];
  });
  const linked = starting.flatMap((h) => {
    const ends = endsOf(project, h.id);
    if (!ends.length) return [];
    const names = ends.map((e) => ('highlight' in e ? cite(project, e.highlight) : `Card: ${cardText(project, e.card) || 'Handwriting'}`));
    const mark = marker('link-mark', h, ends.length === 1 ? `Linked to ${names[0]}` : `Linked to ${ends.length} places`, `Linked to:\n${names.join('\n')}`);
    mark.dataset.linkId = h.id;
    mark.innerHTML = LINK_ICON;
    return [{ h, mark }];
  });
  const pageHeight = view.div.offsetHeight || 1;
  for (const side of [commented, linked])
    spread(
      side.map((m) => m.mark),
      side.map((m) => centre(m.h)),
      pageHeight,
    );
  const notes = layer(view.div, () => document.createElement('div'), 'note-layer', '.annotationLayer');
  notes.replaceChildren(...commented.map((m) => m.mark), ...linked.map((m) => m.mark));

  // Drawn in a fixed number of units across the page, so strokes keep their shape at any zoom,
  // and enough of them that the path's rounding to hundredths does not show.
  // Highlighter strokes go under the text, as highlights do, and the pen's over it.
  const ratio = view.div.offsetHeight / view.div.offsetWidth || 1.294;
  const inks = project.inks.filter((i) => i.docId === docId && i.page === view.id);
  for (const [className, before, marker] of [
    ['marker-layer', '.textLayer', true],
    ['ink-layer', '.annotationLayer', false],
  ] as const) {
    const svg = layer(view.div, () => document.createElementNS(SVG, 'svg'), className, before);
    svg.setAttribute('viewBox', `0 0 ${PAGE_PIXELS} ${PAGE_PIXELS * ratio}`);
    svg.replaceChildren(
      ...inks
        .filter((i) => (i.nib === 'marker') === marker)
        .map((i) => {
          const path = document.createElementNS(SVG, 'path');
          path.setAttribute(
            'd',
            pathOf(
              outline(
                i.points.map(([x, y, p]) => [x * PAGE_PIXELS, y * ratio * PAGE_PIXELS, p]),
                { ...i, size: i.size * PAGE_PIXELS },
              ),
            ),
          );
          const { fill, fillOpacity } = fillOf(i, PAPER);
          path.setAttribute('fill', fill);
          if (fillOpacity) path.setAttribute('fill-opacity', `${fillOpacity}`);
          path.dataset.inkId = i.id;
          return path;
        }),
    );
  }

  // Above everything else on the page, so a box takes its clicks.
  const boxes = layer(view.div, () => document.createElement('div'), 'box-layer', null);
  paintBoxes(
    boxes,
    mine.filter((h) => h.typed && h.parts[0]?.page === view.id),
    states,
  );
}

import { useEffect, useState } from 'react';
import { files, loadDoc } from '../../pdf/pdfjs';
import { pictureBoxes } from '../../pdf/photos';
import { shownLook, useReading } from '../../reading';
import { useStore } from '../../store/project';
import type { Rect } from '../../types';
import type { PageView } from './paint';

/** pdf.js's RenderingStates.FINISHED: the page's canvas holds the whole page. */
const FINISHED = 3;
type Found = { boxes?: Rect[]; finding: Promise<Rect[]> };
// Keyed by the version of the file and the page; a picture's place does not change with the zoom.
const found = new Map<string, Found>();
const drawnFrom = new WeakMap<HTMLElement, HTMLCanvasElement>();

function picturesOn(docId: string, page: number) {
  const key = `${files.key(docId)}:${page}`;
  let known = found.get(key);
  if (!known) {
    const password = useStore.getState().project?.docs.find((d) => d.id === docId)?.password;
    const entry: Found = {
      finding: loadDoc(docId, password)
        .then((doc) => doc.getPage(page))
        .then(pictureBoxes),
    };
    entry.finding.then(
      (boxes) => void (entry.boxes = boxes),
      () => found.delete(key),
    );
    found.set(key, (known = entry));
  }
  return known;
}

const keeping = (s: Parameters<typeof shownLook>[0] & { keepImages: boolean }) => shownLook(s) === 'dark' && s.keepImages;

/**
 * Puts the page's pictures back over a dark page as they are: copies of those parts of the
 * page's canvas, which a filter turns negative along with the text.
 */
function draw(div: HTMLElement, source: HTMLCanvasElement, boxes: Rect[]) {
  let layer = div.querySelector<HTMLElement>(':scope > .photo-layer');
  if (!boxes.length) return layer?.remove();
  if (layer && drawnFrom.get(layer) === source) return;
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'photo-layer';
    div.querySelector(':scope > .canvasWrapper')?.after(layer);
  }
  drawnFrom.set(layer, source);
  layer.replaceChildren(
    ...boxes.map(([x, y, w, h]) => {
      // Only the picture's whole pixels, stretched by under a pixel to its exact edges: a pixel
      // shared with the page around it would show as a light seam.
      const [sx, sy] = [Math.ceil(x * source.width), Math.ceil(y * source.height)];
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor((x + w) * source.width) - sx);
      c.height = Math.max(1, Math.floor((y + h) * source.height) - sy);
      c.getContext('2d')?.drawImage(source, sx, sy, c.width, c.height, 0, 0, c.width, c.height);
      Object.assign(c.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
      return c;
    }),
  );
}

/** Shows a rendered page's pictures as they are while pages are dark and that is asked for, and takes them away otherwise. */
export function paintPhotos(view: PageView & { renderingState?: number }, docId: string | null) {
  if (!docId || !keeping(useReading.getState())) return view.div.querySelector(':scope > .photo-layer')?.remove();
  const source = view.div.querySelector<HTMLCanvasElement>(':scope > .canvasWrapper > canvas:not(.detailView)');
  if (!source?.width || view.renderingState !== FINISHED) return;
  const known = picturesOn(docId, view.id);
  if (known.boxes) return draw(view.div, source, known.boxes);
  void known.finding.then((boxes) => {
    if (!source.isConnected || !keeping(useReading.getState())) return;
    draw(view.div, source, boxes);
    // Squeeze copies of the page were made before the pictures were found.
    view.div.parentElement?.querySelectorAll<HTMLElement>(`:scope > .fold-tail[data-page="${view.id}"] > .page`).forEach((copy) => draw(copy, source, boxes));
  });
}

/** Where a page's pictures are while pages are dark and pictures kept as they are, for its thumbnail; otherwise none. */
export function usePictures(docId: string, page: number) {
  const keep = useReading(keeping);
  const key = `${files.key(docId)}:${page}`;
  const [shown, setShown] = useState<{ key: string; boxes: Rect[] } | null>(null);
  useEffect(() => {
    if (!keep) return;
    let stale = false;
    picturesOn(docId, page).finding.then(
      (boxes) => !stale && setShown({ key, boxes }),
      () => {},
    );
    return () => void (stale = true);
  }, [keep, docId, page, key]);
  return keep && shown?.key === key ? shown.boxes : [];
}

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
      // The picture's whole pixels, stretched over every pixel it touches: a pixel left to the
      // filter shows as a seam of the picture turned negative, and one shared with the paper as a
      // light frame. pdf.js may also draw a picture a pixel past its exact box.
      const [W, H] = [source.width, source.height];
      const [sx, sy] = [Math.ceil(x * W), Math.ceil(y * H)];
      const [sw, sh] = [Math.max(1, Math.floor((x + w) * W) - sx), Math.max(1, Math.floor((y + h) * H) - sy)];
      const [left, top] = [Math.floor(x * W), Math.floor(y * H)];
      const [right, bottom] = [Math.min(W, Math.ceil((x + w) * W)), Math.min(H, Math.ceil((y + h) * H))];
      const c = document.createElement('canvas');
      [c.width, c.height] = [sw, sh];
      c.getContext('2d')?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
      Object.assign(c.style, { left: `${(left / W) * 100}%`, top: `${(top / H) * 100}%`, width: `${((right - left) / W) * 100}%`, height: `${((bottom - top) / H) * 100}%` });
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

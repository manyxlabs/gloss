import { ConnectionMode, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, type Rect } from '@xyflow/react';
import { ImageDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { fitScale, MARGIN, type Paper } from '../canvasPicture';
import { canvasView } from '../canvasView';
import { download } from '../export';
import { useStore } from '../store/project';
import type { Card, Link } from '../types';
import { CardNode } from './CardNode';

const nodeTypes = { card: CardNode };
const useDialog = create<{ open: boolean }>(() => ({ open: false }));
export const openCanvasExport = () => useDialog.setState({ open: true });

type Format = 'png' | 'pdf' | 'svg';
type Options = { only: boolean; format: Format; scale: number; paper: Paper; match: boolean };
/** The PDF's picture is drawn at this scale, sharp in print at the size the canvas is on screen. */
const PDF_SCALE = 2;
/** How long figures may take to be drawn from their PDFs before the picture is taken without them. */
const SETTLE_MS = 15000;
/** Controls for editing, not content: a picture shows what the canvas says. */
const CHROME = '.react-flow__handle, .react-flow__resize-control, .card footer .ghost, .group header .ghost';

/** The cards to draw: all of the canvas, or the chosen ones, with a group's cards and a card's group's place. */
function chosenCards(cards: Card[], links: Link[], only: boolean): { cards: Card[]; links: Link[] } {
  const shown = cards.filter((c) => !c.hidden);
  if (!only) return { cards: shown, links };
  const ids = new Set(shown.filter((c) => c.selected).map((c) => c.id));
  for (const c of shown) if (c.parentId && ids.has(c.parentId)) ids.add(c.id);
  const byId = new Map(shown.map((c) => [c.id, c]));
  const picked = shown.flatMap((c): Card[] => {
    if (!ids.has(c.id)) return [];
    const parent = c.parentId && !ids.has(c.parentId) ? byId.get(c.parentId) : undefined;
    if (!parent) return [c];
    const { parentId: _, extent: __, expandParent: ___, ...loose } = c;
    return [{ ...loose, position: { x: parent.position.x + c.position.x, y: parent.position.y + c.position.y } }];
  });
  return { cards: picked, links: links.filter((l) => ids.has(l.source) && ids.has(l.target)) };
}

const frame = () => new Promise((done) => requestAnimationFrame(done));

/** Waits for the fonts, and for figures drawn from their PDFs, so the picture is taken of the finished cards. */
async function settle(root: HTMLElement) {
  await document.fonts.ready;
  const until = Date.now() + SETTLE_MS;
  // A figure is an empty box until its image is drawn, then an image that loads.
  while (Date.now() < until && (root.querySelector('div.snip:empty') || [...root.querySelectorAll('img')].some((i) => !i.complete))) await frame();
  // The cards are measured again once their images are in.
  await frame();
  await frame();
}

/**
 * A copy of the canvas drawn out of sight for its picture, in its own React Flow: in the light
 * theme unless asked to match, with nothing chosen and no minimap, controls or background.
 */
function Stage({ cards, links, match, onReady }: { cards: Card[]; links: Link[]; match: boolean; onReady: (root: HTMLElement, bounds: Rect) => void }) {
  const root = useRef<HTMLDivElement>(null);
  return createPortal(
    <div ref={root} className={`canvas export-stage${match ? '' : ' light'}`} inert aria-hidden="true">
      <ReactFlowProvider>
        <StageFlow cards={cards} links={links} root={root} onReady={onReady} />
      </ReactFlowProvider>
    </div>,
    document.body,
  );
}

function StageFlow({
  cards,
  links,
  root,
  onReady,
}: {
  cards: Card[];
  links: Link[];
  root: React.RefObject<HTMLDivElement | null>;
  onReady: (root: HTMLElement, bounds: Rect) => void;
}) {
  const rf = useReactFlow();
  const initialized = useNodesInitialized();
  const [nodes] = useState(() => cards.map((c) => ({ ...c, selected: false })));
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });
  useEffect(() => {
    if (!initialized) return;
    let stale = false;
    void settle(root.current!).then(() => !stale && ready.current(root.current!, rf.getNodesBounds(rf.getNodes())));
    return () => void (stale = true);
  }, [initialized, rf, root]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={links}
      nodeTypes={nodeTypes}
      // As on the canvas: links join any side of a card to any other.
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      minZoom={1}
      maxZoom={1}
      proOptions={{ hideAttribution: true }}
    />
  );
}

/** Takes the picture of a staged canvas, cropped to its cards with a margin. */
async function capture(root: HTMLElement, bounds: Rect, format: Format, scale: number) {
  const { toCanvas, toSvg } = await import('html-to-image');
  // Hints in empty fields are for whoever is typing.
  root.querySelectorAll('[placeholder]').forEach((el) => el.removeAttribute('placeholder'));
  const viewport = root.querySelector<HTMLElement>('.react-flow__viewport')!;
  const [width, height] = [Math.ceil(bounds.width + 2 * MARGIN), Math.ceil(bounds.height + 2 * MARGIN)];
  const options = {
    width,
    height,
    backgroundColor: getComputedStyle(root).backgroundColor,
    filter: (el: HTMLElement) => !(el instanceof Element && el.matches(CHROME)),
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${MARGIN - bounds.x}px, ${MARGIN - bounds.y}px) scale(1)` },
  };
  if (format === 'svg') return { width, height, blob: await (await fetch(await toSvg(viewport, options))).blob() };
  const canvas = await toCanvas(viewport, { ...options, pixelRatio: scale, skipAutoScale: true });
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
  if (!blob) throw new Error('The picture could not be encoded.');
  return { width, height, blob };
}

type Job = { cards: Card[]; links: Link[]; options: Options };

/** Exports the canvas on show as a PNG, PDF or SVG picture; opened from the Export menu, or the canvas tools on a phone. */
export function CanvasExport() {
  const open = useDialog((s) => s.open);
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<Options>({ only: false, format: 'png', scale: 2, paper: 'fit', match: false });
  const [job, setJob] = useState<Job | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const project = useStore((s) => s.project);
  const canvasId = useStore((s) => s.canvasId);
  const [cards, links] = project ? canvasView(project, canvasId) : [[], []];
  const chosen = cards.filter((c) => c.selected).length;
  const only = options.only && chosen > 0;

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  const close = () => {
    dialog.current?.close();
    useDialog.setState({ open: false });
    setNote(null);
  };
  const set = (o: Partial<Options>) => (setOptions((v) => ({ ...v, ...o })), setNote(null));

  const finish = async (root: HTMLElement, bounds: Rect) => {
    const { format, paper } = job!.options;
    try {
      const wanted = format === 'png' ? job!.options.scale : PDF_SCALE;
      const scale = fitScale(bounds.width + 2 * MARGIN, bounds.height + 2 * MARGIN, wanted);
      const { width, height, blob } = await capture(root, bounds, format, scale);
      const name = `${project!.name} - ${project!.canvases.find((c) => c.id === canvasId)?.name ?? 'Canvas'}`;
      if (format === 'pdf') download(`${name}.pdf`, await (await import('../canvasPicture')).picturePdf(await blob.arrayBuffer(), width, height, paper, name));
      else download(`${name}.${format}`, blob);
      // Said rather than done quietly, as a sharper copy is then only a smaller selection away.
      if (format !== 'svg' && scale < wanted)
        setNote(`The canvas is too large to draw at ${wanted}×, so it was exported at ${scale.toFixed(1)}×. Export fewer cards for a sharper picture.`);
      else close();
    } catch (err) {
      setNote(`The canvas could not be exported: ${(err as Error).message}`);
    } finally {
      setJob(null);
    }
  };

  if (!open) return null;
  const radios = <T extends string | number | boolean>(name: string, value: T, choices: [T, string, boolean?][], pick: (v: T) => void) => (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {choices.map(([v, label, disabled]) => (
        <label key={String(v)} className={disabled ? 'disabled' : undefined}>
          <input type="radio" name={name} checked={value === v} disabled={disabled} onChange={() => pick(v)} />
          {label}
        </label>
      ))}
    </div>
  );

  return createPortal(
    <dialog ref={dialog} className="web-dialog glass picture-dialog" aria-labelledby="picture-h" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setNote(null);
          setJob({ ...chosenCards(cards, links, only), options });
        }}
      >
        <h2 id="picture-h">
          <ImageDown size={18} /> Export the canvas as a picture
        </h2>
        <fieldset>
          <legend>Cards</legend>
          {radios(
            'Cards',
            only,
            [
              [false, 'Whole canvas'],
              [true, chosen ? `Selected (${chosen})` : 'Selected', !chosen],
            ],
            (v) => set({ only: v }),
          )}
        </fieldset>
        <fieldset>
          <legend>Format</legend>
          {radios(
            'Format',
            options.format,
            [
              ['png', 'PNG'],
              ['pdf', 'PDF'],
              ['svg', 'SVG'],
            ],
            (format) => set({ format }),
          )}
        </fieldset>
        {options.format === 'png' && (
          <fieldset>
            <legend>Size</legend>
            {radios(
              'Size',
              options.scale,
              [
                [1, '1×'],
                [2, '2×'],
                [3, '3×'],
              ],
              (scale) => set({ scale }),
            )}
          </fieldset>
        )}
        {options.format === 'pdf' && (
          <fieldset>
            <legend>Pages</legend>
            {radios(
              'Pages',
              options.paper,
              [
                ['fit', 'One page'],
                ['a4', 'A4'],
                ['letter', 'Letter'],
              ],
              (paper) => set({ paper }),
            )}
          </fieldset>
        )}
        <label className="check">
          <input type="checkbox" checked={options.match} onChange={(e) => set({ match: e.target.checked })} />
          Match the current theme
        </label>
        {note && <p role="status">{note}</p>}
        <div className="actions">
          <button type="button" onClick={close}>
            {note ? 'Close' : 'Cancel'}
          </button>
          <button className="primary" disabled={!!job || !cards.length}>
            {job ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </form>
      {job && <Stage cards={job.cards} links={job.links} match={job.options.match} onReady={(root, bounds) => void finish(root, bounds)} />}
    </dialog>,
    document.body,
  );
}

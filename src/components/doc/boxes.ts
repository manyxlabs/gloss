import { pageAt } from '../../pdf/anchor';
import { pick, useLinking } from '../../store/links';
import { addNote, addTextBox, canvasSpot, excerpt, nextTextBox, startTyping, stopTyping, TEXT_LINE, TEXT_PAD, TEXT_SIZES, updateTextBox, useStore } from '../../store/project';
import type { Rect } from '../../types';
import { paint } from './paint';
import { m } from '../../i18n';

/** A new box's width, and the least a box can be resized to, as fractions of the page's width. */
const NEW_WIDTH = 0.32;
const MIN_WIDTH = 0.06;
/** A press that moves less than this, in screen pixels, is a tap. */
const TAP = 5;

const round = (n: number) => Math.round(n * 1e5) / 1e5;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const boxOf = (id: string) => useStore.getState().project?.highlights.find((h) => h.id === id && h.typed);
const textOf = (el: HTMLElement) => el.firstElementChild as HTMLElement;
/** A box as drawn on its own page rather than on a squeezed page's copy, which is drawn again on every change. */
const own = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.page:not([data-copy]) [data-box-id="${id}"]`);
const editing = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.box-text[contenteditable="plaintext-only"]');

/** The box's rect with its height as it is drawn, which follows its words. */
function measured(el: HTMLElement, id: string): Rect | null {
  const rect = boxOf(id)?.parts[0]?.rects[0];
  const page = el.closest<HTMLElement>('.page');
  return rect && page ? [rect[0], rect[1], rect[2], round(el.offsetHeight / page.offsetHeight)] : null;
}
const fit = (el: HTMLElement, id: string) => {
  const rect = measured(el, id);
  const h = boxOf(id);
  if (rect && h && rect[3] !== h.parts[0]!.rects[0]![3]) updateTextBox(id, { parts: [{ page: h.parts[0]!.page, rects: [rect] }] });
};

/** Starts typing in a box, with the caret where it was tapped or at the end. */
function startEditing(el: HTMLElement, at?: { x: number; y: number }) {
  const text = textOf(el);
  if (text.isContentEditable) return;
  text.contentEditable = 'plaintext-only';
  typing = { id: el.dataset.boxId!, state: startTyping() };
  text.focus({ preventScroll: true });
  const spot = at && document.caretPositionFromPoint?.(at.x, at.y);
  const range = document.createRange();
  if (spot && text.contains(spot.offsetNode)) range.setStart(spot.offsetNode, spot.offset);
  else {
    range.selectNodeContents(text);
    range.collapse(false);
  }
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}
let typing: { id: string; state: ReturnType<typeof startTyping> } | null = null;

export const editBox = (root: HTMLElement, id: string) => {
  const el = own(root, id);
  if (el) startEditing(el);
};

/** Sets a box's letters to the next size, as one step to undo, and fits its height to its words again. */
export function sizeBox(root: HTMLElement, id: string) {
  const h = boxOf(id);
  if (!h) return;
  updateTextBox(id, { typed: { size: TEXT_SIZES[(TEXT_SIZES.indexOf(h.typed!.size) + 1) % TEXT_SIZES.length]! } }, true);
  requestAnimationFrame(() => {
    const el = own(root, id);
    if (el) fit(el, id);
  });
}

type Drag = { id: string; el: HTMLElement; pointer: number; x: number; y: number; resize: boolean; moved: boolean; ghost?: HTMLElement };

/**
 * Text boxes on a document pane's pages: placed with the text box tool by a tap on the page, typed
 * in place, moved by dragging (onto the canvas, an excerpt, or with Alt a note), resized from the
 * right edge. `onPick` opens a box's toolbar.
 */
export function attachBoxes(root: HTMLElement, docNow: () => string | null, onPick: (id: string, box: DOMRect) => void) {
  let drag: Drag | null = null;
  /** A press on the page with the text box tool, which places a box if it lifts where it went down. */
  let press: { pointer: number; x: number; y: number; typed: boolean } | null = null;
  // Shown once the box on screen is drawn, as a move to another page draws it there.
  const pickLater = (id: string) =>
    requestAnimationFrame(() => {
      const el = own(root, id);
      if (el) onPick(id, el.getBoundingClientRect());
    });

  const onDown = (e: PointerEvent) => {
    const tool = useStore.getState().docTool;
    if (e.button > 0 || (tool !== 'select' && tool !== 'text')) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.text-box');
    if (!el) {
      // Only the page itself, not the toolbars and markers over it.
      if (tool === 'text' && (e.target as HTMLElement).closest('.page')) press = { pointer: e.pointerId, x: e.clientX, y: e.clientY, typed: !!editing() };
      return;
    }
    // Inside the box being typed in, the press places the caret.
    if (textOf(el).isContentEditable) return;
    e.preventDefault();
    editing()?.blur();
    el.setPointerCapture(e.pointerId);
    drag = { id: el.dataset.boxId!, el, pointer: e.pointerId, x: e.clientX, y: e.clientY, resize: (e.target as HTMLElement).classList.contains('box-grip'), moved: false };
  };

  const onMove = (e: PointerEvent) => {
    const d = drag;
    const rect = d && d.pointer === e.pointerId && boxOf(d.id)?.parts[0]?.rects[0];
    if (!d || !rect) return;
    const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
    if (!d.moved && Math.hypot(dx, dy) < TAP) return;
    d.moved = true;
    const page = d.el.closest<HTMLElement>('.page')!.getBoundingClientRect();
    if (d.resize) return void (d.el.style.width = `${clamp(rect[2] + dx / page.width, MIN_WIDTH, 1 - rect[0]) * 100}%`);
    Object.assign(d.el.style, { left: `${(rect[0] + dx / page.width) * 100}%`, top: `${(rect[1] + dy / page.height) * 100}%` });
    // Out of the pane it is carried as a copy, to be dropped on the canvas.
    const box = root.getBoundingClientRect();
    const out = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
    if (out && !d.ghost) {
      const at = d.el.getBoundingClientRect();
      d.ghost = Object.assign(d.el.cloneNode(true) as HTMLElement, { className: `${d.el.className} box-ghost` });
      Object.assign(d.ghost.style, { width: `${at.width}px`, fontSize: getComputedStyle(d.el).fontSize, left: '0', top: '0' });
      d.ghost.dataset.grab = `${e.clientX - at.left},${e.clientY - at.top}`;
      document.body.append(d.ghost);
    } else if (!out && d.ghost) {
      d.ghost.remove();
      d.ghost = undefined;
    }
    if (d.ghost) {
      const [gx, gy] = d.ghost.dataset.grab!.split(',').map(Number) as [number, number];
      d.ghost.style.translate = `${e.clientX - gx}px ${e.clientY - gy}px`;
      d.ghost.dataset.drop = canvasSpot.at(e.clientX, e.clientY) ? (e.altKey ? m.doc.dropNote : m.doc.dropExcerpt) : '';
    }
  };

  const onUp = (e: PointerEvent) => {
    const docId = docNow();
    if (press && press.pointer === e.pointerId) {
      const p = press;
      press = null;
      // A tap while typing only ends the typing.
      if (!docId || p.typed || Math.hypot(e.clientX - p.x, e.clientY - p.y) >= TAP || useStore.getState().docTool !== 'text') return;
      place(docId, e.clientX, e.clientY);
      return;
    }
    const d = drag;
    if (!d || d.pointer !== e.pointerId) return;
    drag = null;
    d.ghost?.remove();
    const h = boxOf(d.id);
    const rect = h?.parts[0]?.rects[0];
    if (!h || !rect) return;
    if (!d.moved) {
      if (useLinking.getState().linking) return void pick(d.id);
      // The text box tool types at once; with select, a box is chosen first and typed in on a second tap.
      if (useStore.getState().docTool === 'text' || d.el.classList.contains('chosen')) startEditing(d.el, { x: e.clientX, y: e.clientY });
      return onPick(d.id, d.el.getBoundingClientRect());
    }
    if (d.resize) {
      const width = parseFloat(d.el.style.width) / 100;
      const [x, y] = rect;
      const tall = measured(d.el, d.id)?.[3] ?? rect[3];
      updateTextBox(d.id, { parts: [{ page: h.parts[0]!.page, rects: [[x, y, round(width), tall]] }] }, true);
      return pickLater(d.id);
    }
    const flow = d.ghost && canvasSpot.at(e.clientX, e.clientY);
    // As the store is unchanged by a drop on the canvas, the box is put back by hand.
    Object.assign(d.el.style, { left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%` });
    if (flow) return void (e.altKey ? addNote({ x: flow.x - 24, y: flow.y - 20 }, h.text) : excerpt(h.id, { x: flow.x - 24, y: flow.y - 20 }));
    if (d.ghost) return;
    // Dropped over a page, it goes to that page; between pages, it stays on its own.
    const from = own(root, d.id)?.closest<HTMLElement>('.page')?.getBoundingClientRect();
    if (!from) return;
    const [left, top] = [from.left + rect[0] * from.width + e.clientX - d.x, from.top + rect[1] * from.height + e.clientY - d.y];
    const hit = pageAt(root, e.clientX, e.clientY);
    const [page, box] = hit ? [hit.page, hit.box] : [h.parts[0]!.page, from];
    const moved: Rect = [round(clamp((left - box.left) / box.width, 0, 1 - rect[2])), round(clamp((top - box.top) / box.height, 0, 1 - rect[3])), rect[2], rect[3]];
    updateTextBox(d.id, { parts: [{ page, rects: [moved] }] }, true);
    pickLater(d.id);
  };

  /** Places a box with its first line where the page was tapped, inside the page, and starts typing in it. */
  const place = (docId: string, x: number, y: number) => {
    const hit = pageAt(root, x, y);
    const div = hit && root.querySelector<HTMLElement>(`.page[data-page-number="${hit.page}"]:not([data-copy])`);
    if (!hit || !div) return;
    const look = nextTextBox();
    const letter = look.typed.size * hit.box.width;
    const tall = ((TEXT_LINE + 2 * TEXT_PAD[1]) * letter) / hit.box.height;
    const left = (x - hit.box.left - TEXT_PAD[0] * letter) / hit.box.width;
    const top = (y - hit.box.top - (TEXT_PAD[1] + TEXT_LINE / 2) * letter) / hit.box.height;
    const box = addTextBox(docId, hit.page, [round(clamp(left, 0, 1 - NEW_WIDTH)), round(clamp(top, 0, 1 - tall)), NEW_WIDTH, round(tall)], look);
    // Drawn now rather than when the pane repaints, as a phone shows its keyboard only for a field focused during the tap.
    paint({ id: hit.page, div }, null, docId);
    const el = own(root, box.id);
    if (!el) return;
    startEditing(el);
    onPick(box.id, el.getBoundingClientRect());
  };

  const onInput = (e: Event) => {
    const text = (e.target as HTMLElement).closest<HTMLElement>('.box-text');
    const el = text?.parentElement;
    const id = el?.dataset.boxId;
    const h = id && boxOf(id);
    if (!text || !el || !id || !h) return;
    const rect = measured(el, id);
    updateTextBox(id, { text: text.innerText.replace(/\n$/, ''), ...(rect ? { parts: [{ page: h.parts[0]!.page, rects: [rect] }] } : {}) });
  };

  const onKey = (e: KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.box-text')?.parentElement;
    if (!el || !(e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey)))) return;
    // Escape leaves the typing with the box still chosen, rather than closing its toolbar too.
    e.preventDefault();
    e.stopPropagation();
    textOf(el).blur();
    if (boxOf(el.dataset.boxId!)) onPick(el.dataset.boxId!, el.getBoundingClientRect());
  };

  const onBlur = (e: FocusEvent) => {
    const text = (e.target as HTMLElement).closest<HTMLElement>('.box-text');
    if (!text?.isContentEditable) return;
    text.removeAttribute('contenteditable');
    getSelection()?.removeAllRanges();
    const t = typing;
    typing = null;
    if (t?.state) stopTyping(t.state, t.id);
  };

  const onCancel = (e: PointerEvent) => {
    if (press?.pointer === e.pointerId) press = null;
    if (drag?.pointer !== e.pointerId) return;
    const rect = boxOf(drag.id)?.parts[0]?.rects[0];
    if (rect) Object.assign(drag.el.style, { left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${rect[2] * 100}%` });
    drag.ghost?.remove();
    drag = null;
  };

  const listeners = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onCancel],
    ['input', onInput],
    ['keydown', onKey],
    ['focusout', onBlur],
  ] as const;
  for (const [type, fn] of listeners) root.addEventListener(type, fn as EventListener);
  return () => {
    for (const [type, fn] of listeners) root.removeEventListener(type, fn as EventListener);
  };
}

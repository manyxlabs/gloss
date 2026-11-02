import { Fragment, useRef, useState } from 'react';
import { paneCount, useStore, type Pane } from '../store/project';
import { DocPane } from './DocPane';
import { LinkBanner } from './LinkBanner';
import { usePaneRoom } from './paneRoom';

const SIZES_KEY = 'gloss:pane-sizes';
/** No pane is dragged narrower than this share of the documents' width. */
const MIN_SHARE = 0.15;

/** Each layout's pane widths as shares of the whole, kept per number of panes. */
type Sizes = Record<string, number[]>;
function readSizes(): Sizes {
  try {
    const sizes = JSON.parse(localStorage.getItem(SIZES_KEY) ?? '{}') as unknown;
    return sizes && typeof sizes === 'object' ? (sizes as Sizes) : {};
  } catch {
    return {};
  }
}
const even = (n: number) => Array.from({ length: n }, () => 1 / n);
const valid = (s: number[] | undefined, n: number) =>
  !!s && s.length === n && s.every((x) => Number.isFinite(x) && x >= MIN_SHARE) && Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 0.01;

/** The document panes, side by side with a divider between each two to drag. */
export function DocPanes({ onProblems }: { onProblems: (problems: string[]) => void }) {
  const room = usePaneRoom();
  const count = useStore((s) => Math.min(paneCount(s), room));
  const [sizes, setSizes] = useState(readSizes);
  const box = useRef<HTMLDivElement>(null);
  const shares = valid(sizes[count], count) ? sizes[count]! : even(count);

  const drag = (i: number) => (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { left, width } = box.current!.getBoundingClientRect();
    const start = shares.slice(0, i).reduce((a, b) => a + b, 0);
    const pair = shares[i]! + shares[i + 1]!;
    let next = shares;
    const move = (m: PointerEvent) => {
      const at = Math.min(pair - MIN_SHARE, Math.max(MIN_SHARE, (m.clientX - left) / width - start));
      next = shares.map((s, k) => (k === i ? at : k === i + 1 ? pair - at : s));
      setSizes((all) => ({ ...all, [count]: next }));
    };
    const up = () => {
      removeEventListener('pointermove', move);
      try {
        localStorage.setItem(SIZES_KEY, JSON.stringify({ ...readSizes(), [count]: next }));
      } catch {
        // Storage can be blocked; the panes are then even again on the next visit.
      }
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
  };

  const columns = shares.map((s) => `minmax(0, ${s}fr)`).join(' 5px ');
  return (
    <div className={`docs${count > 1 ? ' split' : ''}`} ref={box} style={{ '--pane-columns': columns } as React.CSSProperties}>
      {Array.from({ length: count }, (_, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="divider pane-divider" role="separator" aria-orientation="vertical" aria-label={`Resize pane ${i}`} onPointerDown={drag(i - 1)} />}
          <DocPane pane={i as Pane} onProblems={onProblems} />
        </Fragment>
      ))}
      <LinkBanner />
    </div>
  );
}

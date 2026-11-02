import { strFromU8, unzipSync } from 'fflate';
import type { Block, Run, Size } from './typeset';

export type Slide = Block[];

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el: Element | undefined, name: string) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const kid = (el: Element | undefined, name: string) => kids(el, name)[0];
const find = (el: Element | Document | undefined, name: string) => (el ? [...el.getElementsByTagNameNS('*', name)] : []);
const rid = (el: Element | undefined, name: string) =>
  el?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name) ?? el?.getAttribute(`r:${name}`) ?? '';

/** Resolves a relationship target against the part that refers to it. */
function resolve(part: string, target: string) {
  if (target.startsWith('/')) return target.slice(1);
  const path = part.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') path.pop();
    else if (seg !== '.') path.push(seg);
  }
  return path.join('/');
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

type Shape = { y: number; x: number; title: boolean; blocks: Block[] };

/** Reads a presentation as its slides in order: the title, then text boxes, tables and pictures as they read from top left. */
export function readPptx(data: Uint8Array): { size: Size; slides: Slide[] } {
  const files = unzipSync(data, { filter: (f) => f.name.startsWith('ppt/') });
  const text = (path: string) => {
    const f = files[path];
    return f ? xml(strFromU8(f)) : undefined;
  };
  const rels = (part: string) => {
    const doc = text(resolve(part, `_rels/${part.split('/').pop()}.rels`));
    return new Map(find(doc, 'Relationship').map((r) => [r.getAttribute('Id') ?? '', resolve(part, r.getAttribute('Target') ?? '')]));
  };

  const pres = text('ppt/presentation.xml');
  if (!pres) throw new Error('it has no slides');
  const presRels = rels('ppt/presentation.xml');
  const sz = find(pres, 'sldSz')[0];
  const [cx, cy] = [Number(sz?.getAttribute('cx')) || 16, Number(sz?.getAttribute('cy')) || 9];

  const slides = find(pres, 'sldId').map((id) => {
    const path = presRels.get(rid(id, 'id')) ?? '';
    const slide = text(path);
    if (!slide) return [];
    const slideRels = rels(path);
    const layoutPath = [...slideRels.values()].find((t) => t.includes('slideLayouts/'));
    const layout = layoutPath ? text(layoutPath) : undefined;

    // A placeholder without its own position takes it from the slide layout.
    const placed = (sp: Element, ph: Element | undefined) => {
      const own = find(kid(sp, 'spPr') ?? kid(sp, 'grpSpPr'), 'off')[0];
      if (own || !ph) return own;
      const same = find(layout, 'ph').find(
        (p) => (ph.getAttribute('idx') && p.getAttribute('idx') === ph.getAttribute('idx')) || (ph.getAttribute('type') && p.getAttribute('type') === ph.getAttribute('type')),
      );
      // ph sits in sp > nvSpPr > nvPr.
      return find(kid(same?.parentElement?.parentElement?.parentElement ?? undefined, 'spPr'), 'off')[0];
    };

    const shapes: Shape[] = [];
    const walk = (tree: Element) => {
      for (const el of tree.children) {
        if (el.localName === 'grpSp') {
          walk(el);
          continue;
        }
        const ph = find(el, 'ph')[0];
        const off = el.localName === 'graphicFrame' ? find(kid(el, 'xfrm'), 'off')[0] : placed(el, ph);
        const at = { x: Number(off?.getAttribute('x') ?? 0), y: Number(off?.getAttribute('y') ?? Number.MAX_SAFE_INTEGER) };
        const type = ph?.getAttribute('type') ?? (ph ? 'obj' : '');
        if (el.localName === 'sp') {
          const title = type === 'title' || type === 'ctrTitle';
          const body = kid(el, 'txBody');
          const blocks = title ? heading(body) : paragraphs(body, type === 'body' || type === 'obj');
          if (blocks.length) shapes.push({ ...at, title, blocks });
        } else if (el.localName === 'pic') {
          const target = slideRels.get(rid(find(el, 'blip')[0], 'embed'));
          const type = IMAGE_TYPES[target?.split('.').pop()?.toLowerCase() ?? ''];
          const bytes = target && files[target];
          if (type && bytes) shapes.push({ ...at, title: false, blocks: [{ kind: 'image', data: new Blob([bytes], { type }) }] });
        } else if (el.localName === 'graphicFrame') {
          const rows = find(el, 'tr').map((tr, i) => ({
            head: i === 0,
            cells: kids(tr, 'tc').map((tc) => find(tc, 'p').flatMap((p, j) => [...(j ? [{ text: '\n' }] : []), ...runs(p)])),
          }));
          if (rows.length) shapes.push({ ...at, title: false, blocks: [{ kind: 'table', rows }] });
        }
      }
    };
    const tree = find(slide, 'spTree')[0];
    if (tree) walk(tree);
    return shapes.sort((a, b) => Number(b.title) - Number(a.title) || a.y - b.y || a.x - b.x).flatMap((s) => s.blocks);
  });
  return { size: [842, (842 * cy) / cx], slides };
}

function runs(p: Element): Run[] {
  return [...p.children].flatMap((r): Run[] => {
    if (r.localName === 'br') return [{ text: '\n' }];
    if (r.localName !== 'r' && r.localName !== 'fld') return [];
    const pr = kid(r, 'rPr');
    const on = (a: string) => pr?.getAttribute(a) === '1' || pr?.getAttribute(a) === 'true';
    return [{ text: kid(r, 't')?.textContent ?? '', bold: on('b'), italic: on('i') }];
  });
}

const textOf = (rs: Run[]) => rs.map((r) => r.text).join('');

function heading(body: Element | undefined): Block[] {
  const rs = kids(body, 'p').flatMap((p, i) => [...(i ? [{ text: '\n' }] : []), ...runs(p)]);
  return textOf(rs).trim() ? [{ kind: 'heading', level: 1, runs: rs }] : [];
}

/** Body placeholders show bullets unless a paragraph turns them off; text boxes only where a paragraph asks for one. */
function paragraphs(body: Element | undefined, bulleted: boolean): Block[] {
  const out: Block[] = [];
  // Open lists by level, so deeper paragraphs nest inside the last item above them.
  const open: Extract<Block, { kind: 'list' }>[] = [];
  for (const p of kids(body, 'p')) {
    const rs = runs(p);
    if (!textOf(rs).trim()) continue;
    const pr = kid(p, 'pPr');
    const level = Number(pr?.getAttribute('lvl') ?? 0);
    const bullet = kid(pr, 'buNone') ? false : !!(kid(pr, 'buChar') || kid(pr, 'buAutoNum')) || bulleted;
    const para: Block = { kind: 'para', runs: rs };
    if (!bullet) {
      open.length = 0;
      out.push(para);
      continue;
    }
    open.length = Math.min(open.length, level + 1);
    while (open.length <= level) {
      const list: Extract<Block, { kind: 'list' }> = { kind: 'list', ordered: !!kid(pr, 'buAutoNum'), items: [] };
      const parent = open.at(-1);
      if (parent) (parent.items.at(-1) ?? (parent.items[0] = [])).push(list);
      else out.push(list);
      open.push(list);
    }
    open[level]!.items.push([para]);
  }
  return out;
}

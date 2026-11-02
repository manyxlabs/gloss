import type { Block, Run } from './typeset';

type Style = Omit<Run, 'text'>;

const SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'MATH',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'BUTTON',
  'FORM',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'NAV',
  'HEAD',
]);
const BLOCK = /^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|ASIDE|FIGURE|FIGCAPTION|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|HR|DL|DT|DD|ADDRESS|DETAILS|SUMMARY|CENTER|CAPTION)$/;
const INLINE: Record<string, Style> = {
  B: { bold: true },
  STRONG: { bold: true },
  I: { italic: true },
  EM: { italic: true },
  CITE: { italic: true },
  DFN: { italic: true },
  CODE: { mono: true },
  KBD: { mono: true },
  SAMP: { mono: true },
  TT: { mono: true },
};

// Line breaks in HTML source are spaces; only <br> breaks a line.
const collapse = (n: Node) => (n.textContent ?? '').replace(/[ \t\n\r\f]+/g, ' ');

/** Collapses white space the way a browser shows it, across the boundaries between runs. */
function tidy(runs: Run[]) {
  let space = true;
  const out: Run[] = [];
  for (const run of runs) {
    let text = run.text.replace(/[^\S\n\xa0]+/g, ' ');
    if (space) text = text.replace(/^ +/, '');
    text = text.replace(/ *\n */g, '\n');
    if (!text) continue;
    space = /[ \n]$/.test(text);
    out.push({ ...run, text });
  }
  for (let last = out.at(-1); last; last = out.at(-1)) {
    last.text = last.text.replace(/[ \n]+$/, '');
    if (last.text) break;
    out.pop();
  }
  return out;
}

function dataImage(src: string): Block | null {
  const m = /^data:([\w.+/-]+)?(;base64)?,(.*)$/s.exec(src);
  if (!m) return null;
  const bytes = m[2] ? Uint8Array.from(atob(m[3]!), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]!));
  return { kind: 'image', data: new Blob([bytes], { type: m[1] ?? '' }) };
}

/** A paragraph's runs, with any block inside it flattened to text. */
function runsOf(node: Node, style: Style = {}, out: Run[] = []) {
  for (const n of node.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) out.push({ ...style, text: collapse(n) });
    if (!(n instanceof Element) || SKIP.has(n.tagName)) continue;
    if (n.tagName === 'BR') out.push({ ...style, text: '\n' });
    else {
      const block = BLOCK.test(n.tagName);
      if (block) out.push({ ...style, text: ' ' });
      runsOf(n, { ...style, ...INLINE[n.tagName], ...(n.tagName === 'A' && n.hasAttribute('href') ? { link: true } : {}) }, out);
      if (block) out.push({ ...style, text: ' ' });
    }
  }
  return out;
}

function blocks(root: Element): Block[] {
  const out: Block[] = [];
  let runs: Run[] = [];
  const flush = () => {
    const tidied = tidy(runs);
    if (tidied.length) out.push({ kind: 'para', runs: tidied });
    runs = [];
  };
  const walk = (node: Node, style: Style) => {
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) runs.push({ ...style, text: collapse(n) });
      if (!(n instanceof Element) || SKIP.has(n.tagName)) continue;
      const tag = n.tagName;
      if (tag === 'BR') runs.push({ ...style, text: '\n' });
      else if (tag === 'IMG') {
        const image = dataImage(n.getAttribute('src') ?? '');
        if (image) {
          flush();
          out.push(image);
        }
      } else if (BLOCK.test(tag)) {
        flush();
        out.push(...block(n));
      } else walk(n, { ...style, ...INLINE[tag], ...(tag === 'A' && n.hasAttribute('href') ? { link: true } : {}) });
    }
  };
  walk(root, {});
  flush();
  return out;
}

function block(el: Element): Block[] {
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) {
    const runs = tidy(runsOf(el));
    return runs.length ? [{ kind: 'heading', level: Number(tag[1]), runs }] : [];
  }
  if (tag === 'UL' || tag === 'OL') {
    // Items left empty are dropped, and pictures, such as a gallery's, stand on their own between the lists around them, without bullets.
    const out: Block[] = [];
    let start = Number(el.getAttribute('start')) || 1;
    let items: Block[][] = [];
    const flush = () => {
      if (items.length) out.push({ kind: 'list', ordered: tag === 'OL', start, items });
      start += items.length;
      items = [];
    };
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const item = blocks(li);
      if (item.some((b) => b.kind === 'image') && item.every((b) => b.kind === 'image' || (b.kind === 'para' && b.muted))) {
        flush();
        out.push(...item);
      } else if (item.length) items.push(item);
    }
    flush();
    return out;
  }
  if (tag === 'BLOCKQUOTE') return [{ kind: 'quote', blocks: blocks(el) }];
  if (tag === 'PRE') return [{ kind: 'code', text: (el.textContent ?? '').replace(/\n$/, '') }];
  if (tag === 'HR') return [{ kind: 'rule' }];
  if (tag === 'FIGCAPTION' || tag === 'CAPTION') {
    const runs = tidy(runsOf(el));
    return runs.length ? [{ kind: 'para', runs, muted: true }] : [];
  }
  if (el instanceof HTMLTableElement) {
    const rows = [...el.rows].map((r) => ({
      head: r.parentElement?.tagName === 'THEAD' || [...r.cells].every((c) => c.tagName === 'TH'),
      cells: [...r.cells].map((c) => tidy(runsOf(c))),
    }));
    return [...(el.caption ? block(el.caption) : []), { kind: 'table', rows }];
  }
  return blocks(el);
}

/** Reads HTML into blocks to typeset. Only `data:` images are kept, since the browser may not fetch others. */
export function htmlToBlocks(html: string) {
  return blocks(new DOMParser().parseFromString(html, 'text/html').body);
}

export async function markdownToBlocks(md: string) {
  const { marked } = await import('marked');
  return htmlToBlocks(await marked.parse(md, { gfm: true }));
}

/** Paragraphs are separated by blank lines; single line breaks are kept as the author wrote them. */
export const textToBlocks = (text: string): Block[] =>
  text
    .replace(/\r\n?/g, '\n')
    .split(/\n[^\S\n]*\n\s*/)
    .map((p) => p.replace(/^\n+|\s+$/g, ''))
    .filter(Boolean)
    .map((p) => ({ kind: 'para', runs: [{ text: p }] }));

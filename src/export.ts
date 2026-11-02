import { cardText } from './search';
import type { Card, Highlight, Project } from './types';

const quote = (text: string) =>
  text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');

/** A figure has no text to quote; it is marked where the image would go, with any text it holds. */
const quoted = (h: Highlight) => (h.area ? `[Figure${h.text ? `: ${h.text}` : ''}]` : h.text);

/** The canvas as notes to keep: groups as sections, cards in reading order with sources and links, then highlights left in the documents. */
export function toMarkdown(p: Project) {
  const docName = (id: string) => p.docs.find((d) => d.id === id)?.name ?? 'Document';
  const byId = new Map(p.cards.map((c) => [c.id, c]));
  const at = (c: Card) => {
    const parent = c.parentId ? byId.get(c.parentId)?.position : undefined;
    return {
      x: c.position.x + (parent?.x ?? 0),
      y: c.position.y + (parent?.y ?? 0),
    };
  };
  // Top to bottom in bands, then left to right, which is how a canvas is usually read.
  const reading = (a: Card, b: Card) => Math.round(at(a).y / 120) - Math.round(at(b).y / 120) || at(a).x - at(b).x;
  const title = (c: Card) => {
    const words = cardText(p, c).split(/\s+/);
    return words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : '');
  };

  const out = [`# ${p.name}`, ''];
  const onCanvas = new Set<string>();
  const write = (c: Card) => {
    const d = c.data;
    if (d.kind === 'note') {
      if (!d.text.trim()) return;
      out.push(d.text.trim(), '');
    } else if (d.kind === 'excerpt') {
      const h = p.highlights.find((x) => x.id === d.highlightId);
      if (!h) return;
      onCanvas.add(h.id);
      out.push(quote(quoted(h)), `> (${docName(h.docId)}, p. ${h.parts[0]?.page})`, '');
      if (h.note) out.push(`Comment: ${h.note}`, '');
      if (d.comment?.trim()) out.push(d.comment.trim(), '');
    } else return;
    const linked = p.links
      .flatMap((l) => (l.source === c.id ? [l.target] : l.target === c.id ? [l.source] : []))
      .flatMap((id) => {
        const other = byId.get(id);
        return other && cardText(p, other) ? [`“${title(other)}”`] : [];
      });
    if (linked.length) out.push(`Linked to: ${linked.join('; ')}`, '');
    out.push('---', '');
  };

  const top = p.cards.filter((c) => !c.parentId).sort(reading);
  for (const c of top) {
    if (c.data.kind !== 'group') {
      write(c);
      continue;
    }
    out.push(`## ${c.data.title.trim() || 'Group'}`, '');
    p.cards
      .filter((x) => x.parentId === c.id)
      .sort(reading)
      .forEach(write);
  }

  const loose = p.highlights.filter((h) => !onCanvas.has(h.id));
  if (loose.length) {
    out.push('## Highlights', '');
    for (const doc of p.docs) {
      const mine = loose
        .filter((h) => h.docId === doc.id)
        .sort((a, b) => (a.parts[0]?.page ?? 0) - (b.parts[0]?.page ?? 0) || (a.parts[0]?.rects[0]?.[1] ?? 0) - (b.parts[0]?.rects[0]?.[1] ?? 0));
      if (!mine.length) continue;
      out.push(`### ${doc.name}`, '');
      for (const h of mine) out.push(`- p. ${h.parts[0]?.page}: ${quoted(h)}`, ...(h.note ? [`  Comment: ${h.note}`] : []));
      out.push('');
    }
  }
  while (out.at(-1) === '' || out.at(-1) === '---') out.pop();
  return `${out.join('\n')}\n`;
}

export { download } from './download';

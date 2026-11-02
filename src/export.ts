import type { Card, Project } from './types';

/** A card's first words, to name it where it is linked from. */
const title = (p: Project, c: Card) => {
  const text = c.data.kind === 'note' ? c.data.text : (p.highlights.find((h) => h.id === (c.data as { highlightId: string }).highlightId)?.text ?? '');
  const words = text.trim().split(/\s+/);
  return words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : '');
};

const quote = (text: string) => text.split('\n').map((l) => `> ${l}`).join('\n');

/** The canvas as notes to keep: cards in reading order with their sources and links, then highlights left in the documents. */
export function toMarkdown(p: Project) {
  const docName = (id: string) => p.docs.find((d) => d.id === id)?.name ?? 'Document';
  const out = [`# ${p.name}`, ''];
  // Top to bottom in bands, then left to right, which is how a canvas is usually read.
  const cards = [...p.cards].sort((a, b) => Math.round(a.position.y / 120) - Math.round(b.position.y / 120) || a.position.x - b.position.x);
  const onCanvas = new Set<string>();
  for (const c of cards) {
    if (c.data.kind === 'note') {
      if (!c.data.text.trim()) continue;
      out.push(c.data.text.trim(), '');
    } else {
      const h = p.highlights.find((x) => x.id === (c.data as { highlightId: string }).highlightId);
      if (!h) continue;
      onCanvas.add(h.id);
      out.push(quote(h.text), `> (${docName(h.docId)}, p. ${h.parts[0]?.page})`, '');
      if (c.data.comment?.trim()) out.push(c.data.comment.trim(), '');
    }
    const linked = p.links.flatMap((l) => (l.source === c.id ? [l.target] : l.target === c.id ? [l.source] : [])).map((id) => p.cards.find((x) => x.id === id));
    if (linked.length) out.push(`Linked to: ${linked.flatMap((x) => (x ? [`“${title(p, x)}”`] : [])).join('; ')}`, '');
    out.push('---', '');
  }
  const loose = p.highlights.filter((h) => !onCanvas.has(h.id));
  if (loose.length) {
    out.push('## Highlights', '');
    for (const doc of p.docs) {
      const mine = loose.filter((h) => h.docId === doc.id).sort((a, b) => (a.parts[0]?.page ?? 0) - (b.parts[0]?.page ?? 0) || (a.parts[0]?.rects[0]?.[1] ?? 0) - (b.parts[0]?.rects[0]?.[1] ?? 0));
      if (!mine.length) continue;
      out.push(`### ${doc.name}`, '');
      for (const h of mine) out.push(`- p. ${h.parts[0]?.page}: ${h.text}`);
      out.push('');
    }
  }
  while (out.at(-1) === '' || out.at(-1) === '---') out.pop();
  return `${out.join('\n')}\n`;
}

export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'notes'}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

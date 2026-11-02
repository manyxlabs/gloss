import { cite, commentOf, endsOf, quoted, where } from './links';
import { cardText } from './search';
import type { Card, Project } from './types';

/**
 * `note` is the comment pinned to the passage in the document; `comment` is the one written on the card.
 * `links` are the cards a card is connected to, and `passages` the passages linked to it or to its passage, as cited.
 */
export type NoteItem = { links: string[]; passages: string[] } & (
  { kind: 'note'; text: string } | { kind: 'excerpt'; text: string; doc: string; where: string; note?: string; comment?: string }
);
/** The notes in the order every export writes them: sections of cards (a group, or loose cards between groups), then highlights left in the documents. */
export type Outline = {
  title: string;
  sections: { title?: string; items: NoteItem[] }[];
  highlights: { doc: string; items: { where: string; text: string; note?: string; passages: string[] }[] }[];
};

export function outline(p: Project): Outline {
  const docName = (id: string) => p.docs.find((d) => d.id === id)?.name ?? 'Document';
  const passagesOf = (highlightId: string) => endsOf(p, highlightId).flatMap((e) => ('highlight' in e ? [cite(p, e.highlight)] : []));
  const linkedTo = (cardId: string) =>
    p.cardLinks.flatMap((l) => (l.cardId === cardId ? [p.highlights.find((h) => h.id === l.highlightId)] : [])).flatMap((h) => (h ? [cite(p, h)] : []));
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

  const onCanvas = new Set<string>();
  const item = (c: Card): NoteItem[] => {
    const d = c.data;
    const links = p.links
      .flatMap((l) => (l.source === c.id ? [l.target] : l.target === c.id ? [l.source] : []))
      .flatMap((id) => {
        const other = byId.get(id);
        return other && cardText(p, other) ? [title(other)] : [];
      });
    if (d.kind === 'note') return d.text.trim() ? [{ kind: 'note', text: d.text.trim(), links, passages: linkedTo(c.id) }] : [];
    if (d.kind !== 'excerpt') return [];
    const h = p.highlights.find((x) => x.id === d.highlightId);
    if (!h) return [];
    onCanvas.add(h.id);
    return [
      {
        kind: 'excerpt',
        text: quoted(h),
        doc: docName(h.docId),
        where: where(h),
        note: commentOf(p, h)?.text,
        comment: d.comment?.trim() || undefined,
        links,
        passages: [...passagesOf(h.id), ...linkedTo(c.id)],
      },
    ];
  };

  const sections: Outline['sections'] = [];
  for (const c of p.cards.filter((c) => !c.parentId).sort(reading)) {
    if (c.data.kind === 'group')
      sections.push({
        title: c.data.title.trim() || 'Group',
        items: p.cards
          .filter((x) => x.parentId === c.id)
          .sort(reading)
          .flatMap(item),
      });
    else {
      const loose = sections.at(-1)?.title === undefined ? sections.at(-1) : undefined;
      if (loose) loose.items.push(...item(c));
      else sections.push({ items: item(c) });
    }
  }

  const left = p.highlights.filter((h) => !onCanvas.has(h.id));
  const highlights = p.docs
    .map((doc) => ({
      doc: doc.name,
      items: left
        .filter((h) => h.docId === doc.id)
        .sort((a, b) => (a.parts[0]?.page ?? 0) - (b.parts[0]?.page ?? 0) || (a.parts[0]?.rects[0]?.[1] ?? 0) - (b.parts[0]?.rects[0]?.[1] ?? 0))
        .map((h) => ({ where: where(h), text: quoted(h), note: commentOf(p, h)?.text, passages: passagesOf(h.id) })),
    }))
    .filter((d) => d.items.length);
  return { title: p.name, sections, highlights };
}

const quote = (text: string) =>
  text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');

/** The canvas as Markdown notes: groups as sections, cards in reading order with sources and links, then highlights left in the documents. */
export function toMarkdown(p: Project) {
  const o = outline(p);
  const out = [`# ${o.title}`, ''];
  for (const s of o.sections) {
    if (s.title !== undefined) out.push(`## ${s.title}`, '');
    for (const i of s.items) {
      if (i.kind === 'note') out.push(i.text, '');
      else {
        out.push(quote(i.text), `> (${i.doc}, ${i.where})`, '');
        if (i.note) out.push(`Comment: ${i.note}`, '');
        if (i.comment) out.push(i.comment, '');
      }
      if (i.links.length) out.push(`Linked to: ${i.links.map((l) => `“${l}”`).join('; ')}`, '');
      for (const passage of i.passages) out.push(`Linked passage: ${passage}`, '');
      out.push('---', '');
    }
  }
  if (o.highlights.length) {
    out.push('## Highlights', '');
    for (const d of o.highlights) {
      out.push(`### ${d.doc}`, '');
      for (const h of d.items) out.push(`- ${h.where}: ${h.text}`, ...(h.note ? [`  Comment: ${h.note}`] : []), ...h.passages.map((l) => `  Linked passage: ${l}`));
      out.push('');
    }
  }
  while (out.at(-1) === '' || out.at(-1) === '---') out.pop();
  return `${out.join('\n')}\n`;
}

export { download } from './download';

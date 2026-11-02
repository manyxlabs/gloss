import { typeset, type Block } from './convert/typeset';
import type { NoteItem, Outline } from './export';

const para = (text: string, muted?: boolean): Block => ({ kind: 'para', runs: [{ text }], ...(muted ? { muted } : {}) });

function item(i: NoteItem): Block[] {
  const body: Block[] =
    i.kind === 'note'
      ? [para(i.text)]
      : [
          { kind: 'quote', blocks: [para(i.text), para(`(${i.doc}, p. ${i.page})`, true)] },
          ...(i.note ? [para(`Comment: ${i.note}`)] : []),
          ...(i.comment ? [para(i.comment)] : []),
        ];
  return i.links.length ? [...body, para(`Linked to: ${i.links.map((l) => `“${l}”`).join('; ')}`, true)] : body;
}

/** The notes typeset as a PDF, in the outline's order. */
export async function notesPdf(o: Outline) {
  const blocks: Block[] = [{ kind: 'heading', level: 1, runs: [{ text: o.title }] }];
  for (const s of o.sections) {
    if (s.title !== undefined) blocks.push({ kind: 'heading', level: 2, runs: [{ text: s.title }] });
    s.items.forEach((i, n) => blocks.push(...(n ? [{ kind: 'rule' } as const] : []), ...item(i)));
  }
  if (o.highlights.length) {
    blocks.push({ kind: 'heading', level: 2, runs: [{ text: 'Highlights' }] });
    for (const d of o.highlights)
      blocks.push(
        { kind: 'heading', level: 3, runs: [{ text: d.doc }] },
        { kind: 'list', ordered: false, items: d.items.map((h) => [para(`p. ${h.page}: ${h.text}${h.note ? ` (comment: ${h.note})` : ''}`)]) },
      );
  }
  const { bytes } = await typeset(o.title, blocks);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

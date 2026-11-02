import { typeset, type Block } from './convert/typeset';
import type { NoteItem, Outline } from './export';
import { inkPng } from './inkImage';

const para = (text: string, muted?: boolean): Block => ({ kind: 'para', runs: [{ text }], ...(muted ? { muted } : {}) });

async function item(i: NoteItem): Promise<Block[]> {
  const body: Block[] =
    i.kind !== 'excerpt'
      ? [...(i.kind === 'note' && i.text ? [para(i.text)] : []), ...(i.ink ? [{ kind: 'image', data: await inkPng(i.ink) } as const] : [])]
      : [
          { kind: 'quote', blocks: [para(i.text), para(`(${i.doc}, p. ${i.page})`, true)] },
          ...(i.note ? [para(`Comment: ${i.note}`)] : []),
          ...(i.comment ? [para(i.comment)] : []),
        ];
  return [
    ...body,
    ...(i.tags.length ? [para(`Tags: ${i.tags.join(' ')}`, true)] : []),
    ...(i.links.length ? [para(`Linked to: ${i.links.map((l) => `“${l}”`).join('; ')}`, true)] : []),
    ...i.passages.map((l) => para(`Linked passage: ${l}`, true)),
  ];
}

/** The notes typeset as a PDF, in the outline's order. */
export async function notesPdf(o: Outline) {
  const blocks: Block[] = [{ kind: 'heading', level: 1, runs: [{ text: o.title }] }];
  for (const s of o.sections) {
    if (s.title !== undefined) blocks.push({ kind: 'heading', level: 2, runs: [{ text: s.title }] }, ...(s.tags?.length ? [para(`Tags: ${s.tags.join(' ')}`, true)] : []));
    for (const [n, i] of s.items.entries()) blocks.push(...(n ? [{ kind: 'rule' } as const] : []), ...(await item(i)));
  }
  if (o.highlights.length) {
    blocks.push({ kind: 'heading', level: 2, runs: [{ text: 'Highlights' }] });
    for (const d of o.highlights)
      blocks.push(
        { kind: 'heading', level: 3, runs: [{ text: d.doc }] },
        {
          kind: 'list',
          ordered: false,
          items: d.items.map((h) => [
            para(`p. ${h.page}: ${h.text}`),
            ...(h.note ? [para(`Comment: ${h.note}`)] : []),
            ...(h.tags.length ? [para(`Tags: ${h.tags.join(' ')}`, true)] : []),
            ...h.passages.map((l) => para(`Linked passage: ${l}`, true)),
          ]),
        },
      );
  }
  const { bytes } = await typeset(o.title, blocks);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

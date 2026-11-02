import { BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import type { NoteItem, Outline } from './export';
import { inkPng, type InkImage } from './inkImage';

const MUTED = '6B6B78';
const runs = (text: string, color?: string) => text.split('\n').map((t, i) => new TextRun({ text: t, break: i ? 1 : 0, color }));
const para = (text: string, color?: string) => new Paragraph({ children: runs(text, color), spacing: { after: 120 } });
const heading = (text: string, heading: (typeof HeadingLevel)[keyof typeof HeadingLevel]) => new Paragraph({ heading, children: runs(text) });
const quoted = (text: string, color?: string) =>
  new Paragraph({
    children: runs(text, color),
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D6D6E0', space: 10 } },
    spacing: { after: color ? 160 : 40 },
  });

/** Handwriting as a picture, at most the width of the page's text. */
async function picture(ink: InkImage) {
  const k = Math.min(1, 600 / ink.width);
  const data = new Uint8Array(await (await inkPng(ink)).arrayBuffer());
  return new Paragraph({
    children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(ink.width * k), height: Math.round(ink.height * k) } })],
    spacing: { after: 120 },
  });
}

async function item(i: NoteItem) {
  const body =
    i.kind !== 'excerpt'
      ? [...(i.kind === 'note' && i.text ? [para(i.text)] : []), ...(i.ink ? [await picture(i.ink)] : [])]
      : [quoted(i.text), quoted(`(${i.doc}, p. ${i.page})`, MUTED), ...(i.note ? [para(`Comment: ${i.note}`)] : []), ...(i.comment ? [para(i.comment)] : [])];
  return [
    ...body,
    ...(i.links.length ? [para(`Linked to: ${i.links.map((l) => `“${l}”`).join('; ')}`, MUTED)] : []),
    ...i.passages.map((l) => para(`Linked passage: ${l}`, MUTED)),
  ];
}

/** The notes as a Word document, in the outline's order. */
export async function notesDocx(o: Outline) {
  const children = [heading(o.title, HeadingLevel.TITLE)];
  for (const s of o.sections) {
    if (s.title !== undefined) children.push(heading(s.title, HeadingLevel.HEADING_1));
    for (const i of s.items) children.push(...(await item(i)));
  }
  if (o.highlights.length) {
    children.push(heading('Highlights', HeadingLevel.HEADING_1));
    for (const d of o.highlights) {
      children.push(heading(d.doc, HeadingLevel.HEADING_2));
      for (const h of d.items)
        children.push(
          new Paragraph({ bullet: { level: 0 }, children: runs(`p. ${h.page}: ${h.text}`) }),
          ...(h.note ? [new Paragraph({ indent: { left: 720 }, children: runs(`Comment: ${h.note}`) })] : []),
          ...h.passages.map((l) => new Paragraph({ indent: { left: 720 }, children: runs(`Linked passage: ${l}`, MUTED) })),
        );
    }
  }
  return Packer.toBlob(new Document({ creator: 'Gloss', title: o.title, sections: [{ children }] }));
}

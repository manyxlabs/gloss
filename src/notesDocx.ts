import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { NoteItem, Outline } from './export';

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

function item(i: NoteItem) {
  const body = i.kind === 'note' ? [para(i.text)] : [quoted(i.text), quoted(`(${i.doc}, p. ${i.page})`, MUTED), ...(i.comment ? [para(i.comment)] : [])];
  return i.links.length ? [...body, para(`Linked to: ${i.links.map((l) => `“${l}”`).join('; ')}`, MUTED)] : body;
}

/** The notes as a Word document, in the outline's order. */
export function notesDocx(o: Outline) {
  const children = [heading(o.title, HeadingLevel.TITLE)];
  for (const s of o.sections) {
    if (s.title !== undefined) children.push(heading(s.title, HeadingLevel.HEADING_1));
    for (const i of s.items) children.push(...item(i));
  }
  if (o.highlights.length) {
    children.push(heading('Highlights', HeadingLevel.HEADING_1));
    for (const d of o.highlights) {
      children.push(heading(d.doc, HeadingLevel.HEADING_2));
      for (const h of d.items) children.push(new Paragraph({ bullet: { level: 0 }, children: runs(`p. ${h.page}: ${h.text}`) }));
    }
  }
  return Packer.toBlob(new Document({ creator: 'Gloss', title: o.title, sections: [{ children }] }));
}

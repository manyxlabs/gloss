import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/** A text PDF: each page is a list of paragraphs, wrapped to the page like a real document. */
export async function makePdf(pages: string[][]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const size = 13;
  for (const paragraphs of pages) {
    const page = pdf.addPage([612, 792]);
    let y = 720;
    for (const paragraph of paragraphs) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > 480) {
          page.drawText(line, { x: 66, y, size, font });
          y -= size * 1.5;
          line = word;
        } else line = next;
      }
      page.drawText(line, { x: 66, y, size, font });
      y -= size * 2.6;
    }
  }
  return Buffer.from(await pdf.save());
}

export const ESSAY = [
  [
    'The ocean covers more than seventy percent of the surface of the Earth and holds nearly all of its water.',
    'Coral reefs occupy less than one percent of the ocean floor, yet they support about a quarter of all marine species.',
    'Rising sea temperatures cause corals to expel the algae living in their tissues, a process known as bleaching.',
  ],
  [
    'Mangrove forests protect coastlines from storms and store carbon at rates far higher than most land forests.',
    'Overfishing removes predators and grazers alike, and a reef without grazing fish is soon smothered by seaweed.',
    'Marine protected areas, when they are enforced, allow fish populations to recover within a decade.',
  ],
  ['Kelp forests grow up to half a metre a day and shelter hundreds of species along cold, rocky coasts.'],
];

export const NOTES = [
  ['Field notes from the reef survey. Water clarity was good and bleaching was visible on the shallow branching corals.'],
  ['Parrotfish numbers were lower than in the previous survey, which may explain the spread of algae on the eastern slope.'],
];

/** A PDF that opens only with `password`, encrypted by qpdf as a real protected file would be. */
export async function encryptedPdf(password: string) {
  const dir = mkdtempSync(join(tmpdir(), 'gloss-'));
  writeFileSync(join(dir, 'plain.pdf'), await makePdf([['Confidential findings: the northern reef recovered faster than expected after the heatwave.']]));
  execFileSync('qpdf', ['--encrypt', password, `${password}-owner`, '256', '--', join(dir, 'plain.pdf'), join(dir, 'locked.pdf')]);
  return readFileSync(join(dir, 'locked.pdf'));
}

/** Where `pictureReport` draws its picture, in PDF points from the bottom left. */
export const PICTURE = { x: 196, y: 250, width: 220, height: 160 };

/** A page of text with a picture (`png`) below it and a caption, as a report with a photograph would be. */
export async function pictureReport(png: Buffer) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const page = pdf.addPage([612, 792]);
  const lines = [
    'Survey of the reef flat at low tide, with the transect marked by a red buoy line.',
    'Branching corals were pale on the shallow side and healthy beyond the drop off.',
    'Grazing fish were counted along each transect in the morning and the afternoon.',
  ];
  lines.forEach((text, i) => page.drawText(text, { x: 66, y: 720 - i * 24, size: 13, font }));
  page.drawImage(await pdf.embedPng(png), PICTURE);
  page.drawText('Photograph 1: the northern transect', { x: 210, y: 226, size: 12, font });
  return Buffer.from(await pdf.save());
}

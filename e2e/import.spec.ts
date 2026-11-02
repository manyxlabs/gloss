import { copyFileSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { AlignmentType, Document, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ARTIFACTS, card, openProject, picture, select, shot, STANDARD_FONTS } from './helpers';
import { ESSAY } from './pdfs';

type File = { name: string; mimeType: string; buffer: Buffer };

/** Opens the files from the start page as a new project. */
async function open(page: Page, files: File[]) {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles(files);
  // Typesetting takes seconds, and longer on a machine busy with other tests.
  await expect(page.locator('.doc-status')).toBeVisible({ timeout: 20_000 });
}

const span = (page: Page, text: string) => page.locator('.textLayer span', { hasText: text }).first();
const height = async (page: Page, text: string) => (await span(page, text).boundingBox())!.height;
const layerText = (page: Page) =>
  page
    .locator('.textLayer')
    .allTextContents()
    .then((t) => t.join(' ').replace(/\s+/g, ' '));

/** Selects a sentence, excerpts it and checks the card holds exactly that sentence. */
async function excerpt(page: Page, from: string, to: string, sentence: string) {
  await select(page, from, to);
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, from).locator('blockquote')).toHaveText(sentence);
}

const PARAGRAPH = 'Rock pools are cut off from the sea twice a day, so the animals in them must survive heat, rain and changing salt until the tide returns.';

test('a Word document becomes a typeset PDF with headings, lists, a table and its picture', async ({ page }) => {
  await page.goto('/');
  const photo = await picture(page, 240, 120, '#2a7ab8', 'image/png');
  const numbered = { config: [{ reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }] }] };
  const doc = new Document({
    numbering: numbered,
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Field guide to the shore')] }),
          new Paragraph({
            children: [
              new TextRun('The shore changes by the hour. '),
              new TextRun({ text: 'Bold claims', bold: true }),
              new TextRun(' and '),
              new TextRun({ text: 'quiet asides', italics: true }),
              new TextRun(' sit in one line.'),
            ],
          }),
          new Paragraph(PARAGRAPH),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('What to bring')] }),
          new Paragraph({ text: 'Boots with a good grip', bullet: { level: 0 } }),
          new Paragraph({ text: 'A tide table', bullet: { level: 0 } }),
          new Paragraph({ text: 'Check the tide', numbering: { reference: 'steps', level: 0 } }),
          new Paragraph({ text: 'Walk on bare rock', numbering: { reference: 'steps', level: 0 } }),
          new Table({
            rows: [
              new TableRow({ children: ['Animal', 'Zone'].map((t) => new TableCell({ children: [new Paragraph(t)] })) }),
              new TableRow({ children: ['Limpet', 'Upper shore'].map((t) => new TableCell({ children: [new Paragraph(t)] })) }),
            ],
          }),
          new Paragraph({ children: [new ImageRun({ type: 'png', data: photo, transformation: { width: 240, height: 120 } })] }),
          // Enough text to run onto a second page.
          ...Array.from({ length: 14 }, (_, i) => new Paragraph(`Observation ${i + 1}. ${PARAGRAPH}`)),
        ],
      },
    ],
  });
  await open(page, [{ name: 'Field guide.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await Packer.toBuffer(doc) }]);

  const tab = page.getByRole('tab', { name: 'Field guide' });
  await expect(tab).toHaveAttribute('title', 'Field guide\nConverted from Field guide.docx');
  await expect(page.getByText('Page 1 / 2')).toBeVisible();
  await expect(span(page, 'Field guide to the shore')).toBeVisible();
  const text = await layerText(page);
  for (const words of ['Bold claims', 'quiet asides', 'Boots with a good grip', '1.', 'Walk on bare rock', 'Limpet', 'Upper shore', 'Observation 1.'])
    expect(text).toContain(words);
  expect(await height(page, 'Field guide to the shore')).toBeGreaterThan((await height(page, 'The shore changes')) * 1.6);
  expect(await height(page, 'What to bring')).toBeGreaterThan((await height(page, 'The shore changes')) * 1.3);
  await excerpt(page, 'Rock pools are cut off', 'until the tide returns.', PARAGRAPH);
  await shot(page, 'import-docx');

  // The picture is in the PDF, as an image drawn on the first page.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(await download.path())), standardFontDataUrl: STANDARD_FONTS }).promise;
  const ops = await (await pdf.getPage(1)).getOperatorList();
  expect(ops.fnArray).toContain(OPS.paintImageXObject);
});

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = (id: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/x" Target="${target}"/>`;
const RELS = (...r: string[]) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`;
const sp = (ph: string, y: number, paras: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="600000" y="${y}"/><a:ext cx="10000000" cy="900000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`;
const para = (text: string, lvl = 0, bold = false) => `<a:p><a:pPr lvl="${lvl}"/><a:r><a:rPr b="${bold ? 1 : 0}"/><a:t>${text}</a:t></a:r></a:p>`;
const slide = (shapes: string) => `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;

test('a PowerPoint deck becomes one landscape page per slide, in the deck’s order', async ({ page }) => {
  await page.goto('/');
  const photo = await picture(page, 300, 150, '#d0602a', 'image/png');
  // The slide list names the second slide file first, so order must come from it rather than from file names.
  const pptx = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'ppt/presentation.xml': strToU8(
      `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(RELS(REL('rId2', 'slides/slide1.xml'), REL('rId3', 'slides/slide2.xml'))),
    'ppt/slides/slide2.xml': strToU8(
      slide(
        sp('<p:ph type="title"/>', 300000, para('Reef survey 2026')) +
          sp(
            '<p:ph idx="1"/>',
            1500000,
            para('Water clarity was good at every site.') + para('Bleaching on the shallow corals', 1) + para('Fewer parrotfish than last year', 0, true),
          ),
      ),
    ),
    'ppt/slides/slide1.xml': strToU8(
      slide(
        // A text box placed below the picture, but listed first.
        sp('', 4800000, para('Grazers keep the algae down on healthy reefs.')) +
          sp('<p:ph type="title"/>', 300000, para('Findings')) +
          `<p:pic><p:nvPicPr><p:cNvPr id="4" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId9"/></p:blipFill><p:spPr><a:xfrm><a:off x="600000" y="1500000"/><a:ext cx="3000000" cy="1500000"/></a:xfrm></p:spPr></p:pic>`,
      ),
    ),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(RELS(REL('rId9', '../media/image1.png'))),
    'ppt/media/image1.png': photo,
  });
  await open(page, [{ name: 'Survey deck.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from(pptx) }]);

  await expect(page.getByText('Page 1 / 2')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Survey deck' })).toHaveAttribute('title', /Converted from Survey deck\.pptx/);
  const first = (await page.locator('.page').first().boundingBox())!;
  expect(first.width / first.height).toBeCloseTo(16 / 9, 1);
  await expect(span(page, 'Reef survey 2026')).toBeVisible();
  expect(await height(page, 'Reef survey 2026')).toBeGreaterThan((await height(page, 'Water clarity')) * 1.4);
  // The first slide's title comes before its bullets, and the second slide's title is on page 2.
  const title = (await span(page, 'Reef survey 2026').boundingBox())!;
  expect((await span(page, 'Water clarity').boundingBox())!.y).toBeGreaterThan(title.y);
  for (const words of ['•', '–', 'Bleaching on the shallow corals', 'Fewer parrotfish']) expect(await layerText(page)).toContain(words);
  await excerpt(page, 'Water clarity', 'Water clarity', 'Water clarity was good at every site.');
  await span(page, 'Grazers keep').scrollIntoViewIfNeeded();
  expect((await span(page, 'Grazers keep').boundingBox())!.y).toBeGreaterThan((await span(page, 'Findings').boundingBox())!.y);
  await shot(page, 'import-pptx');
});

test('images added together become one PDF, a page each, in order', async ({ page }) => {
  await page.goto('/');
  // A one-pixel GIF, written out by hand since a canvas cannot encode GIF.
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  await open(page, [
    { name: 'Wide shore.png', mimeType: 'image/png', buffer: await picture(page, 400, 200, '#1e8a5a', 'image/png') },
    { name: 'Tall cliff.jpg', mimeType: 'image/jpeg', buffer: await picture(page, 200, 400, '#8a1e5a', 'image/jpeg') },
    { name: 'Square pool.webp', mimeType: 'image/webp', buffer: await picture(page, 300, 300, '#5a1e8a', 'image/webp') },
    { name: 'Dot.gif', mimeType: 'image/gif', buffer: gif },
  ]);
  await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Wide shore' })).toHaveAttribute('title', 'Wide shore\nConverted from Wide shore.png, Tall cliff.jpg, Square pool.webp, Dot.gif');
  await expect(page.getByText('Page 1 / 4')).toBeVisible();
  const pages = page.locator('.page');
  await expect(pages).toHaveCount(4);
  const shapes = await pages.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width / e.getBoundingClientRect().height));
  expect(shapes[0]).toBeCloseTo(2, 1);
  expect(shapes[1]).toBeCloseTo(0.5, 1);
  expect(shapes[2]).toBeCloseTo(1, 1);
  await shot(page, 'import-images');
});

test('Markdown and plain text are typeset, in any Latin, Greek or Cyrillic script, and other scripts are added as pictures with a warning', async ({ page }) => {
  const md = [
    '# Shore notes',
    '',
    'Tides follow the moon, and *spring tides* bring the **lowest** water of the month.',
    '',
    '## Words from other shores',
    '',
    '- Ωκεανός means ocean in Greek.',
    '- Океан means ocean in Russian.',
    '- Ça dépend de la marée, says the guide in Brittany.',
    '',
    '1. First low tide',
    '2. Second low tide',
    '',
    '| Day | Low water |',
    '| --- | --- |',
    '| Monday | 06:10 |',
    '',
    '```',
    'tide = moon + sun',
    'if tide.low:',
    '    walk()',
    '```',
    '',
    '> The sea is never still.',
    '',
    'समुद्र तट पर सुबह शांत थी।',
  ].join('\n');
  const txt = 'Low tide at dawn.\nThe pools were full of life.\n\nA second paragraph about the evening tide, which came in quickly over the flat sand.';
  await open(page, [
    { name: 'Shore notes.md', mimeType: 'text/markdown', buffer: Buffer.from(md) },
    { name: 'Diary.txt', mimeType: 'text/plain', buffer: Buffer.from(txt) },
  ]);

  await expect(page.getByRole('alert')).toContainText('Shore notes: Some text uses a script Gloss cannot typeset yet');
  await expect(span(page, 'Shore notes')).toBeVisible();
  const text = await layerText(page);
  for (const words of [
    'spring tides',
    'lowest',
    'Ωκεανός means ocean',
    'Океан means ocean',
    'Ça dépend de la marée',
    '1.',
    'Second low tide',
    'Monday',
    '06:10',
    'tide = moon + sun',
    'The sea is never still.',
  ])
    expect(text).toContain(words);
  // The Devanagari line is a picture, not garbled text.
  expect(text).not.toContain('समुद्र');
  // Code keeps its indentation.
  expect((await span(page, 'walk()').boundingBox())!.x).toBeGreaterThan((await span(page, 'if tide.low:').boundingBox())!.x + 10);
  expect(await height(page, 'Shore notes')).toBeGreaterThan((await height(page, 'Tides follow')) * 1.6);
  await excerpt(page, 'Ωκεανός', 'Ωκεανός', 'Ωκεανός means ocean in Greek.');
  await shot(page, 'import-markdown');

  await page.getByRole('tab', { name: 'Diary' }).click();
  await expect(page.getByRole('tab', { name: 'Diary' })).toHaveAttribute('title', 'Diary\nConverted from Diary.txt');
  await expect(span(page, 'The pools were full of life.')).toBeVisible();
  await excerpt(page, 'A second paragraph', 'flat sand.', 'A second paragraph about the evening tide, which came in quickly over the flat sand.');
});

test('notes export as Markdown, PDF and Word with the same sections and sources', async ({ page }) => {
  await openProject(page);
  await select(page, 'Coral reefs occupy', 'of all marine species.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  const canvas = (await page.locator('.canvas').boundingBox())!;
  await page.mouse.dblclick(canvas.x + 140, canvas.y + canvas.height - 160);
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Reefs are small but crowded.');
  // A highlight left in the document, which the notes list after the canvas.
  await select(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight yellow' }).click();

  const save = async (label: string, file: string) => {
    await page.getByRole('button', { name: 'Export notes' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: label }).click()]);
    expect(download.suggestedFilename()).toBe(`Reef essay.${file.split('.').pop()}`);
    copyFileSync(await download.path(), `${ARTIFACTS}/${file}`);
    return readFileSync(`${ARTIFACTS}/${file}`);
  };
  await page.getByRole('button', { name: 'Export notes' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(3);
  await shot(page, 'export-menu');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  const md = (await save('Markdown (.md)', 'export-notes.md')).toString();
  expect(md).toContain(`> ${ESSAY[0]![1]}\n> (Reef essay, p. 1)`);

  const pdf = await getDocument({ data: new Uint8Array(await save('PDF (.pdf)', 'export-notes.pdf')), standardFontDataUrl: STANDARD_FONTS }).promise;
  const page1 = await pdf.getPage(1);
  const items = (await page1.getTextContent()).items.flatMap((i) => ('str' in i ? [i] : []));
  const pdfText = items.map((i) => i.str).join(' ');
  for (const words of ['Reef essay', 'Coral reefs occupy', '(Reef essay, p. 1)', 'Reefs are small but crowded.', 'Highlights', 'p. 1: Rising sea temperatures'])
    expect(pdfText).toContain(words);
  // The project title is the largest type on the page.
  const size = (s: string) => Math.max(...items.filter((i) => i.str.includes(s)).map((i) => i.height));
  expect(size('Reef essay')).toBeGreaterThan(size('Coral reefs occupy') * 1.6);

  const docx = unzipSync(new Uint8Array(await save('Word (.docx)', 'export-notes.docx')));
  const xml = strFromU8(docx['word/document.xml']!);
  for (const words of [
    'Reef essay',
    'Coral reefs occupy less than one percent',
    '(Reef essay, p. 1)',
    'Reefs are small but crowded.',
    'Highlights',
    'p. 1: Rising sea temperatures',
  ])
    expect(xml).toContain(words);
  expect(xml).toMatch(/w:pStyle w:val="Title"/);
});

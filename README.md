# Gloss

Read PDFs next to an infinite canvas.
Pull passages out of your documents, arrange and connect them, add your own notes, and jump back to the exact line any excerpt came from.

Everything runs in the browser.
PDFs and notes are kept in the browser's own storage (IndexedDB), nothing is uploaded, and there is no account.
The one exception is adding a web page: its address goes to Gloss's server, which fetches the page because a browser may not read other sites.

## What it does

- **More than PDFs.** Word (.docx) and PowerPoint (.pptx) files, images (JPG, PNG, WebP, GIF, HEIC), text and Markdown are converted in the browser into PDFs with real, selectable text, so everything else works on them as on any PDF.
  Images added together become one PDF, a page each.
  A slide deck becomes one landscape page per slide.
- **Web pages.** Add from the web with an address: the article is kept with its title, author, pictures, source address and the date it was saved.
- **Excerpts that link back.** Select text and press Excerpt, or drag the selection onto the canvas. The card opens the document at the passage, and clicking the passage shows its card.
- **Highlights** in five colours, kept apart from excerpts until you want them on the canvas.
- **Squeeze** the text between two passages out of view to read them side by side: pinch two fingers held one above the other, or select what is in between and press Squeeze. A bar marks each squeeze and opens it again.
- **Handwriting** on pages and on the canvas, with a pen, an eraser and four inks. A stylus writes even while the select tool is chosen.
- **Groups**: select cards and group them under a name; drag a card in or out, and move the group to move them all.
- **Export the PDF** with your highlights, excerpt comments and handwriting as standard PDF annotations, so any reader shows them and can edit them.
- **Several documents in one project**, in tabs, all feeding the same canvas.
- **Notes and links.** Double-click the canvas to write a note, and drag from a card's edge onto another card to connect them.
- **Search everything**: every page of every PDF and every card, with Ctrl+K.
- **Undo and redo** with Ctrl+Z and Ctrl+Shift+Z.
- **Export notes** as Markdown, PDF or Word, with groups as sections and each excerpt's source and page.
- **Phones**: one side at a time, touch selection, and pinch to zoom the page.

## Develop

```sh
npm install
npm run dev
```

Checks:

```sh
npm run lint
npx tsc
npm run test:e2e
```

Adding web pages needs the Worker in `worker/`, which `npm run worker` runs locally.
Its tests run the built app under `wrangler dev` next to a small local site:

```sh
npx playwright test -c playwright.import.config.ts
```

The end-to-end tests build the app, drive it in Chromium on a desktop and a phone viewport, and leave screenshots and the exported notes in `test-results/artifacts/`.
Set `CHROMIUM` to a system Chromium where Playwright's own browser download is unavailable, and `BASE_URL` to test a deployed copy instead.

## Converted documents

Conversion keeps a document's words, structure and pictures, not its exact look.

- **Word**: headings, paragraphs, bold and italic, lists, simple tables and pictures.
  Fonts, colours, columns, headers, footers, footnotes, comments and drawing shapes are left out, and pictures in EMF or WMF are dropped.
- **PowerPoint**: each slide's title, then its text boxes, tables and pictures from top left, on one page per slide, with type shrunk until the slide fits.
  Positions, themes, charts, SmartArt, speaker notes and animations are not kept.
- **Web pages**: the article as a reader view finds it, with up to 20 pictures.
  Pages that build their text with scripts may come out short.
- **Scripts**: text is set in Noto Sans, which covers Latin, Greek and Cyrillic.
  Scripts whose letters must be joined or reordered (Devanagari, Arabic, Hebrew, Thai and others) and Chinese, Japanese and Korean cannot be set as text by the PDF library Gloss uses, so a paragraph in them is drawn by the browser and placed as a picture, with a warning.
  Such paragraphs cannot be selected, excerpted or searched.
  In tables and code, characters the font lacks become “?”.

## Contributing

Issues and pull requests are welcome at [manyxlabs/gloss](https://github.com/manyxlabs/gloss).

## License

MIT

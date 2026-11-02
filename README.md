# Gloss

Read PDFs next to an infinite canvas.
Pull passages out of your documents, arrange and connect them, add your own notes, and jump back to the exact line any excerpt came from.

Everything runs in the browser.
PDFs and notes are kept in the browser's own storage (IndexedDB), and there is no account.
Nothing is uploaded unless you share a project, and then only encrypted.
The one other exception is adding a web page: its address goes to Gloss's server, which fetches the page because a browser may not read other sites.

## What it does

- **More than PDFs.** Word (.docx) and PowerPoint (.pptx) files, images (JPG, PNG, WebP, GIF, HEIC), text and Markdown are converted in the browser into PDFs with real, selectable text, so everything else works on them as on any PDF.
  Images added together become one PDF, a page each.
  A slide deck becomes one landscape page per slide.
- **Web pages.** Add from the web with an address: the article is kept with its title, author, pictures, source address and the date it was saved.
- **Excerpts that link back.** Select text and press Excerpt, or drag the selection onto the canvas. The card opens the document at the passage, and clicking the passage shows its card.
- **Highlights** in five colours, kept apart from excerpts until you want them on the canvas.
- **Figures and tables**: pick Snip and draw a box around one. Excerpted, its card shows that part of the page as a picture, drawn from the PDF.
- **Comments in the margin**: comment on a selection or on any highlight. A marker beside the line opens the comment to edit.
- **Contents, pages and highlights** in a sidebar beside each document: the PDF's table of contents, page thumbnails, and every highlight and comment in page order.
- **Password protected PDFs** open after you enter the password, which is kept only in this browser.
- **Squeeze** the text between two passages out of view to read them side by side: pinch two fingers held one above the other, or select what is in between and press Squeeze. A bar marks each squeeze and opens it again.
- **Handwriting** on pages and on the canvas, with a pen, an eraser and four inks. A stylus writes even while the select tool is chosen.
- **Groups**: select cards and group them under a name; drag a card in or out, and move the group to move them all.
- **Export the PDF** with your highlights, boxed figures, comments and handwriting as standard PDF annotations, so any reader shows them and can edit them. A password protected PDF cannot be exported this way; save a copy without the password first.
- **Several documents in one project**, in tabs, all feeding the same canvas, and two of them side by side (or two places in one).
- **Several canvases per project**, one per line of thought; showing a card opens the canvas it is on.
- **Notes and links.** Double-click the canvas to write a note, and drag from a card's edge onto another card to connect them, or draw a line between them with the pen.
- **Backups**: download a project with its PDFs as one `.gloss` file, and restore it in any browser.
- **Search everything**: every page of every PDF, every card and every comment, with Ctrl+K.
- **Undo and redo** with Ctrl+Z and Ctrl+Shift+Z.
- **Export notes** as Markdown, PDF or Word, with groups as sections and each excerpt's source and page.
- **Phones**: one side at a time, touch selection, and pinch to zoom the page.
- **Sync and work together**, end-to-end encrypted, when you choose to share a project.

## Sync and sharing

A project stays on its device until you press **Share** in its header and create a link.
Open the link on another device, or send it to someone, and the project appears there with its PDFs, then stays in step: excerpts, notes, links, handwriting, squeezes, canvases and the project's name.
Everyone in the project shows as an avatar with where they are reading, and their pointer shows on the canvas.
Edits made offline are kept and merge when the connection returns.
**Stop syncing on this device** keeps the local copy but stops exchanging changes; the others carry on.

Each project is a [Yjs](https://yjs.dev) document with a map per kind of thing, so edits to different things merge and the last edit to one card, highlight or stroke wins.
Selection, undo history and the page you were reading on stay with each device.
The Worker relays changes through a Durable Object per shared project, over a WebSocket that hibernates while nobody is editing, and keeps the PDFs in R2.
It keeps a log of changes, which devices replace with a snapshot once it grows long.

### Security model

- The link is the key. It ends in `#/join/<room>.<key>`, and the part after `#` never leaves the browser, so the server never sees the key.
- The key is 256 random bits. Two keys are derived from it with HKDF: one encrypts every change, presence update, snapshot and PDF with AES-GCM (a fresh random IV each time, and the kind of message bound in as associated data), the other proves to the server that a device may use the room.
- The server keeps only a SHA-256 hash of that second key, taken from the first device to connect, and turns away anything else. It cannot work back to the encryption key from it.
- The server stores and relays scrambled bytes. It learns the room id, sizes and timing, document ids, and how many devices are connected, but not names, text, PDFs or who is who.
- A password protected PDF's password travels with a shared project, encrypted like everything else, so the others can open it; anyone with the link can read the document in any case.
- Anyone with the link can read and edit the project, and there is no way to take access back short of moving to a new link: stop syncing, share again, and pass on the new link.

## Develop

```sh
npm install
npm run dev
```

Sync needs the Worker, which `npm run worker` builds and runs locally with wrangler, emulating the Durable Object and R2.
Deploying needs the R2 bucket first: `npx wrangler r2 bucket create gloss-files`.

Checks:

```sh
npm run lint
npx tsc
npx tsc -p worker
npm run test:e2e
npm run test:sync
```

Adding web pages needs the Worker in `worker/`, which `npm run worker` runs locally.
Its tests run the built app under `wrangler dev` next to a small local site:

```sh
npx playwright test -c playwright.import.config.ts
```

The end-to-end tests build the app, drive it in Chromium on a desktop and a phone viewport, and leave screenshots and the exported notes in `test-results/artifacts/`.
The sync test runs against the Worker under wrangler with three browser contexts as three devices, and checks that no WebSocket frame or uploaded file holds any of the text or PDF in the clear.
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

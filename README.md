# Gloss

Read PDFs next to an infinite canvas.
Pull passages out of your documents, arrange and connect them, add your own notes, and jump back to the exact line any excerpt came from.

Everything runs in the browser.
PDFs and notes are kept in the browser's own storage (IndexedDB), and there is no account.
Nothing is uploaded unless you share a project, and then only encrypted.
The one other exception is adding from a link: the address goes to Gloss's server, which fetches the page or file because a browser may not read other sites.

## What it does

- **More than PDFs.** Word (.docx) and PowerPoint (.pptx) files, images (JPG, PNG, WebP, GIF, HEIC), text and Markdown are converted in the browser into PDFs with real, selectable text, so everything else works on them as on any PDF.
  Images added together become one PDF, a page each.
  A slide deck becomes one landscape page per slide.
- **Web pages.** Add from a link with a page's address: the article is kept with its title, author, pictures, source address and the date it was saved.
- **Share links.** A share link from Google Drive (including Google Docs, Slides and Sheets, exported as PDFs), Dropbox, OneDrive or SharePoint, or Box adds the file itself rather than the page that shows it, as does a link straight to a file.
  The file is then converted like any file opened from the computer.
  A private link is refused with a reason: share the file so that anyone with the link can view it.
- **Page tools** in the sidebar's Pages tab: rotate, move, duplicate and delete pages, and insert pages from any file Gloss opens, before or after a page.
  Pick several pages with Ctrl or Shift, use a page's menu, or drag pages to a new place.
  Highlights, figures, comments, handwriting and excerpts move with their pages, and turn with them; deleting pages that hold any asks first, with counts.
- **Excerpts that link back.** Select text and press Excerpt, or drag the selection onto the canvas. The card opens the document at the passage, and clicking the passage shows its card.
- **Highlights** in 32 colours, kept apart from excerpts until you want them on the canvas.
  Five favourites sit in every highlight toolbar and More opens the rest; Edit favourites in the palette changes which five, on each device.
  The five colours Gloss started with keep their names and shades.
- **Lasso**: with the pen, draw a loop round words on a page to excerpt exactly those words, or round a picture to excerpt it as a figure. A stroke that does not close stays handwriting.
- **Figures and tables**: pick Snip and draw a box around one. Excerpted, its card shows that part of the page as a picture, drawn from the PDF.
- **Comments in the margin**: comment on a selection or on any highlight. A marker beside the line opens the comment to edit.
  One comment can be attached to several passages, in any of the documents: its marker shows beside each, and editing it beside one edits it everywhere.
  Deleting a passage takes the comment off it, and the comment goes with its last passage.
- **Linked passages**: press Link on a highlight or a selection, then pick the other end, a highlight or new selection in any document or either pane (Escape cancels).
  A marker in the left margin shows what a passage is linked to and goes there, opening it in the other pane when two are side by side, so both are in view.
- **Ink links**: with the pen, draw from a highlight onto a card on the canvas to link them.
  The card shows where its passage is, and the passage's marker shows the card.
- **Contents, pages and highlights** in a sidebar beside each document: the PDF's table of contents, page thumbnails, and every highlight and comment in page order.
- **Password protected PDFs** open after you enter the password, which is kept with the project (and, in a shared project, travels with it end-to-end encrypted).
- **Squeeze** the text between two passages out of view to read them side by side: pinch two fingers held one above the other, or select what is in between and press Squeeze. A bar marks each squeeze and opens it again.
- **Handwriting** on pages and on the canvas, with a pen, an eraser and four inks. A stylus writes even while the select tool is chosen, and once one has been used, a finger or palm scrolls and pans instead of drawing.
  An **ink box** is a card to write in, resized from its corners, and writing on a note keeps the strokes in the note.
  The notes exports show handwriting as pictures.
  On the canvas the eraser also takes away the links it passes over: lines between cards, a card's links to passages, and its links to other canvases; undo brings them back.
- **Groups**: select cards and group them under a name, or pinch two cards together on a touch screen; drag a card in or out, move the group to move them all, and collapse it to its name (pinch it closed, spread it open) with its links ending on it.
- **Export the PDF** with your highlights, boxed figures, comments and handwriting as standard PDF annotations, so any reader shows them and can edit them.
  Linked passages in the same document become links that go to each other; links to another document are named in the passage's note. A password protected PDF cannot be exported this way; save a copy without the password first.
- **Several documents in one project**, in tabs, all feeding the same canvas, and two of them side by side (or two places in one).
- **Several canvases per project**, one per line of thought; showing a card opens the canvas it is on.
  A **nested canvas** card opens a canvas inside the one it is on, with a path back up; the tabs show the top level, and each tab's menu the canvases in it.
  A card can link to any canvas, with a chip that opens it, and deleting a nested canvas's card takes the canvas and everything in it, until undone.
- **Canvas style**: each canvas has its own background (dots, grid or plain), note colour and accent, which travel with it to the other devices.
- **Copy links** to a passage, card, comment, canvas or document. Opening one opens the project there; pasted into a note or a comment, it shows as a chip with a few words of what it leads to, in this project or another one on the same device.
  In a shared project a link names the project's room, so it works for everyone who has the project, and only for them.
- **Notes and links.** Double-click the canvas to write a note, and drag from a card's edge onto another card to connect them, or draw a line between them with the pen.
- **Installable and offline**: install Gloss as an app from the browser; once visited it opens and works with no network, and an installed copy on a computer can open PDFs, Word and PowerPoint files from the file manager. A new version is loaded only when you choose.
- **Backups**: download a project with its PDFs as one `.gloss` file, and restore it in any browser.
- **Search everything**: every page of every PDF, every card and every comment, with Ctrl+K.
- **Undo and redo** with Ctrl+Z and Ctrl+Shift+Z, page edits included.
- **Folders** on the start page: file projects in folders from a project's folder button or by dragging, rename, collapse and delete them (their projects are kept).
  Projects are listed by when they were last opened.
- **Export notes** as Markdown, PDF or Word, with groups as sections, each excerpt's source and page, and the passages linked to it.
- **Phones**: one side at a time, touch selection, and pinch to zoom the page.
- **Sync and work together**, end-to-end encrypted, when you choose to share a project.
  Type @ in a note or comment to mention someone who has been in the project; the bell lists mentions, replies and what the others did since you last looked.

## Sync and sharing

A project stays on its device until you press **Share** in its header and create a link.
Open the link on another device, or send it to someone, and the project appears there with its PDFs, then stays in step: excerpts, notes, links, comments, linked passages, handwriting, squeezes, canvases, page edits and the project's name.
Library folders stay with each device.
A document or a canvas marked **Only on this device** stays here, with everything on it; see below.
Everyone in the project shows as an avatar with where they are reading, and their pointer shows on the canvas.
Edits made offline are kept and merge when the connection returns.
**Stop syncing on this device** keeps the local copy but stops exchanging changes; the others carry on.

Each project is a [Yjs](https://yjs.dev) document with a map per kind of thing, so edits to different things merge and the last edit to one card, highlight or stroke wins.
Selection, undo history and the page you were reading on stay with each device.
Beside the project, the shared document keeps who has been in it, by a random id each device makes and the name they gave, and a month of who added, changed or removed what, one entry per person and thing.
Mentions, replies and the activity list come from these, and which of them are read is kept on each device; the server relays them like any other change, encrypted.
The Worker relays changes through a Durable Object per shared project, over a WebSocket that hibernates while nobody is editing, and keeps the PDFs in R2.
It keeps a log of changes, which devices replace with a snapshot once it grows long.
An edit to a document's pages stores a new version of its file under a new name; the document's entry names that version, so the other devices fetch it, and switch to it once it has arrived.

### Security model

- The link is the key. It ends in `#/join/<room>.<key>`, and the part after `#` never leaves the browser, so the server never sees the key.
- The key is 256 random bits. Two keys are derived from it with HKDF: one encrypts every change, presence update, snapshot and PDF with AES-GCM (a fresh random IV each time, and the kind of message bound in as associated data), the other proves to the server that a device may use the room.
- The server keeps only a SHA-256 hash of that second key, taken from the first device to connect, and turns away anything else. It cannot work back to the encryption key from it.
- The server stores and relays scrambled bytes. It learns the room id, sizes and timing, document ids, and how many devices are connected, but not names, text, PDFs or who is who.
- A password protected PDF's password travels with a shared project, encrypted like everything else, so the others can open it; anyone with the link can read the document in any case.
- Anyone with the link can read and edit the project, and there is no way to take access back short of moving to a new link: stop syncing, share again, and pass on the new link.
- **Only on this device.** A document or a canvas can be kept back from a shared project, from the lock in the document's toolbar or in Canvas style.
  It is left out of the shared document with everything anchored to it: a document's highlights, comments only it has, handwriting, squeezes, excerpts and links to them; a canvas's cards, the canvases nested in it and the lines and links to its cards.
  None of it is sent, encrypted or not, its file is not uploaded, and the others are not even told its id, in presence either.
- Marking something private after it was shared sends its removal: the other devices delete it, file and all, and the room's copy of the file is deleted.
  What the others already saw, or kept in a backup, cannot be called back, so mark things private before sharing when that matters.
  Sharing it again sends it as new; undo does either.

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

Adding from links needs the Worker in `worker/`, which `npm run worker` runs locally.
Its tests run the built app under `wrangler dev`: web pages next to a small local site, and share links against a local server that answers at the cloud storage providers' addresses, which the test Worker is pointed at with `TEST_PROVIDER_ORIGIN` (unset, as in production, nothing is redirected).

```sh
npx playwright test -c playwright.import.config.ts
npx playwright test -c playwright.links.config.ts
```

The end-to-end tests build the app, drive it in Chromium on a desktop and a phone viewport, and leave screenshots and the exported notes in `test-results/artifacts/`.
The sync tests (`sync.spec.ts` and `*.sync.spec.ts`) run against the Worker under wrangler with browser contexts as devices, and check that no WebSocket frame or uploaded file holds any of the text or PDF in the clear, and that what is kept on one device never reaches the other's copy of the shared document.
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

## Page tools

Each edit is written with pdf-lib into a new version of the file, stored beside the old one, and the document switches to it in one step.
The page tree is rewritten in place, so the table of contents, links, forms and metadata stay, and objects nothing refers to any more are dropped, so deleting pages makes the file smaller.
A duplicated page shares its original's content but not its links or form fields.
A squeeze is kept only where it still hides the same pages, unturned; others are opened.
Undo switches back to the earlier version, which is kept while the undo history needs it; the history keeps the last ten versions of files, and older page edits drop out of it.
A password protected PDF cannot be rewritten: page tools ask for a copy without the password.

## Adding from links

`/api/file` turns a share link into the address that downloads its file (Drive's `uc?export=download`, following its confirm page for files too large to scan; Dropbox's `dl=1`; OneDrive's shares API; SharePoint's `download=1`; Box's shared static link), then fetches it with the same checks as a web page: http and https only, names checked against private networks over DNS, every redirect checked again, a time limit, and a 50 MB limit.
Only PDFs, Word and PowerPoint files, images and text come back, recognised by their first bytes as many downloads are labelled only as bytes.
A redirect to a sign in page, or a refusal from the provider, is reported as a private link.

Pickers that browse a Google Drive, Dropbox, OneDrive or Box account need app keys registered with each provider, which Gloss does not have.
A picker would hand its files to the same path as files opened from the computer: `addDocs` (or `importFiles` from the start page), which converts them in `src/convert`.

## Contributing

Issues and pull requests are welcome at [manyxlabs/gloss](https://github.com/manyxlabs/gloss).

## License

MIT

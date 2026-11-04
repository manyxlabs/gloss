# Gloss

Read PDFs next to an infinite canvas.
Pull passages out of your documents, arrange and connect them, add your own notes, and jump back to the exact line any excerpt came from.

Everything runs in the browser.
PDFs and notes are kept in the browser's own storage (IndexedDB), and there is no account.
Nothing is uploaded unless you share a project, and then only encrypted.
The one other exception is adding from a link: the address goes to Gloss's server, which fetches the page or file because a browser may not read other sites.
The [privacy policy](https://gloss.manyxlabs.com/privacy) has the details.

## What it does

- **More than PDFs.** Word (.docx) and PowerPoint (.pptx) files, images (JPG, PNG, WebP, GIF, HEIC), text and Markdown are converted in the browser into PDFs with real, selectable text, so everything else works on them as on any PDF.
  Images added together become one PDF, a page each.
  A slide deck becomes one landscape page per slide.
- **Web pages.** Add from a link with a page's address: the article is kept with its title, author, pictures, source address and the date it was saved.
- **Share links.** A share link from Google Drive (including Google Docs, Slides and Sheets, exported as PDFs), Dropbox, OneDrive or SharePoint, or Box adds the file itself rather than the page that shows it, as does a link straight to a file.
  The file is then converted like any file opened from the computer.
  A private link is refused with a reason: share the file so that anyone with the link can view it.
- **Google Drive and Dropbox.** Open from either one (on the start page, in an empty project, or from the list of documents) to pick files, private ones too, in the provider's own picker.
  The browser downloads them straight from Google or Dropbox, and they are added like files opened from the computer; Google Docs, Slides and Sheets come as PDFs.
  Google Drive is asked only for the files you pick (the `drive.file` scope), and its sign in is kept only in memory.
- **Whole folders.** Drop a folder, or choose one with **Open a folder** (in a project, **Choose a folder** or the folder button in the list of documents), and every file Gloss opens in it and in the folders inside it is added, with its progress shown.
  The folders inside become folders of documents, and on the start page they can instead become a project each.
  Files Gloss cannot open are named and left out; hidden files are skipped.
- **Page tools** in the sidebar's Pages tab: rotate, move, duplicate and delete pages, and insert pages from any file Gloss opens, before or after a page.
  Pick several pages with Ctrl or Shift, use a page's menu, or drag pages to a new place.
  Highlights, figures, comments, handwriting and excerpts move with their pages, and turn with them; deleting pages that hold any asks first, with counts.
- **Replace a document with a newer version** from its tab's menu or the list of documents, and keep the markup: highlights, comments, links, excerpts, handwriting, squeezes and bookmarks move to the same words in the new text, through inserted paragraphs, edited sentences and pages that flow differently.
  What cannot be found is listed as unplaced in the sidebar's Highlights tab, with its comments and excerpts, to place on a selection or delete; undo puts the old version back.
- **Extract pages** from a page's menu: to a new document in the project, with the highlights, comments, links, handwriting and bookmarks on them, or as a PDF to download.
- **Excerpts that link back.** Select text and press Excerpt, or drag the selection onto the canvas. The card opens the document at the passage, and clicking the passage shows its card.
- **Highlights** in 32 colours, kept apart from excerpts until you want them on the canvas.
  Five favourites sit in every highlight toolbar and More opens the rest; Edit favourites in the palette changes which five, on each device.
  The five colours Gloss started with keep their names and shades.
- **Lasso**: with the pen, draw a loop round words on a page to excerpt exactly those words, or round a picture to excerpt it as a figure. A stroke that does not close stays handwriting.
- **Figures and tables**: pick Snip and draw a box around one. Excerpted, its card shows that part of the page as a picture, drawn from the PDF.
- **Text boxes**: pick the text box tool and tap the page to type there.
  Drag a box to move it, even to another page, and its right edge to make it wider or narrower; its height follows its words.
  Its toolbar sets its colour and its size, small, medium or large, and links, tags, excerpts and deletes it like a highlight; a second tap or Enter types in it again, Escape stops typing, and Delete removes a chosen box.
  Dragged onto the canvas it becomes an excerpt that leads back to it, or with Alt a note.
  Boxes stay with their words through zoom, page edits and a replaced document, keep their words upright on a turned page, are found by search, and export as text boxes any reader shows.
- **Comments in the margin**: comment on a selection or on any highlight. A marker beside the line opens the comment to edit.
  One comment can be attached to several passages, in any of the documents: its marker shows beside each, and editing it beside one edits it everywhere.
  Deleting a passage takes the comment off it, and the comment goes with its last passage.
- **Linked passages**: press Link on a highlight or a selection, then pick the other end, a highlight or new selection in any document or either pane (Escape cancels).
  A marker in the left margin shows what a passage is linked to and goes there, opening it in the other pane when two are side by side, so both are in view.
- **Ink links**: with the pen, draw from a highlight onto a card on the canvas to link them.
  The card shows where its passage is, and the passage's marker shows the card.
- **Contents, pages and highlights** in a sidebar beside each document: your bookmarks and the PDF's table of contents, page thumbnails, and every highlight and comment in page order.
- **Bookmarks**: press the bookmark in a document's toolbar, or Ctrl+D, to keep the place you are reading, named after its first words.
  Rename, reorder (drag, or from a bookmark's menu), copy a link to and delete them in the sidebar; they become outline entries in exported PDFs.
- **Scanned PDFs**: pages that are only pictures of text are found when a document opens, and **Make text selectable** (in the banner, or a page's menu in the Pages tab) reads them on the device in English, Hindi or both.
  The words are written into the PDF as invisible text over their pictures, so selecting, excerpting, searching, squeezing and exporting work as on any PDF.
- **Annotations from other apps**: highlights, underlines, strike-outs, squiggles, sticky notes, text boxes and ink that Acrobat, Preview and others left in a PDF can be brought in as Gloss's own, when the PDF is added or later from the Highlights tab.
- **Password protected PDFs** open after you enter the password, which is kept with the project (and, in a shared project, travels with it end-to-end encrypted).
- **Squeeze** the text between two passages out of view to read them side by side: pinch two fingers held one above the other, or select what is in between and press Squeeze. A bar marks each squeeze and opens it again.
- **Handwriting** on pages and on the canvas, with a pen and an eraser. A stylus writes even while the select tool is chosen, and once one has been used, a finger or palm scrolls and pans instead of drawing.
  The pen's style, remembered on each device, has five inks, three widths and four nibs: pressure, an even ballpoint, calligraphy with a slanted nib, and a highlighter that sits under the text.
  Rest the pen at the end of a stroke, or hold Shift, to make it a straight line.
  An **ink box** is a card to write in, resized from its corners, and writing on a note keeps the strokes in the note.
  The notes exports show handwriting as pictures.
  On the canvas the eraser also takes away the links it passes over: lines between cards, a card's links to passages, and its links to other canvases; undo brings them back.
- **Groups**: select cards and group them under a name, or pinch two cards together on a touch screen; drag a card in or out, move the group to move them all, and collapse it to its name (pinch it closed, spread it open) with its links ending on it.
- **Export the PDF** with your highlights, boxed figures, text boxes, comments and handwriting as standard PDF annotations, so any reader shows them and can edit them, and your bookmarks in its outline.
  **Documents as one PDF**, from Export notes, puts the documents you choose, in the order you choose, into one annotated PDF with an outline entry for each, and the canvas on show as a last page if you like.
  Linked passages in the same document become links that go to each other; links to another document are named in the passage's note. A password protected PDF cannot be exported this way; save a copy without the password first.
- **Several documents in one project**, in tabs, all feeding the same canvas, and two of them side by side (or two places in one), or three on a screen at least 1440 pixels wide, with dividers to drag between them.
  Jumps open in the pane already showing a document, and a link's other end opens in another pane.
- **A list of all the documents** from the tab bar: put them in folders, pin them to come first, and reorder them by dragging their tabs or rows.
- **Zotero**: connect your library with a key of your own, search it, and add items' PDFs with their title, authors, year and citation key; send a document's highlights and comments back to its item as a note.
- **Several canvases per project**, one per line of thought; showing a card opens the canvas it is on.
  A **nested canvas** card opens a canvas inside the one it is on, with a path back up; the tabs show the top level, and each tab's menu the canvases in it.
  A card can link to any canvas, with a chip that opens it, and deleting a nested canvas's card takes the canvas and everything in it, until undone.
- **Canvas style**: each canvas has its own background (dots, grid, lined or plain), note colour and accent, which travel with it to the other devices.
- **Copy links** to a passage, card, comment, canvas or document. Opening one opens the project there; pasted into a note or a comment, it shows as a chip with a few words of what it leads to, in this project or another one on the same device.
  In a shared project a link names the project's room, so it works for everyone who has the project, and only for them.
- **Notes and links.** Double-click the canvas to write a note, and drag from a card's edge onto another card to connect them, or draw a line between them with the pen.
- **Installable and offline**: install Gloss as an app from the browser; once visited it opens and works with no network, and an installed copy on a computer can open PDFs, Word and PowerPoint files from the file manager, and on a phone or tablet takes files shared to it from other apps. A new version is loaded only when you choose.
- **Backups**: download a project with its PDFs as one `.gloss` file, and restore it in any browser.
- **Search everything**: every page of every PDF, every card, every comment and every text box, with Ctrl+K.
  Type `#tag` to find what carries a tag, or pick tags from the chips above the results.
- **Act on all search results**: highlight, tag or excerpt every match at once, in one document or all of them, link them all to a new note or the chosen card, or squeeze the documents down to them.
  Matches become real highlights on their words, placed from the PDF's text positions, across lines; each action is one undo step.
- **Tags** on highlights, figures, excerpts, notes and groups, in categories and colours.
  Tag from a highlight's or a selection's toolbar (Highlight with tag), the comment editor or the canvas's selection bar, and rename, recolour, file, merge and delete tags in the tags manager.
  Filter by tag: the sidebar lists only the highlights that carry the tags chosen, and the canvas dims the rest.
- **Squeeze to highlights or matches**: the squeeze button below a document hides everything but its highlights (of a colour or a tag, if chosen) or the matches of some words, with a chosen number of lines of context; Expand all opens it again.
  In a pane too narrow for the button, such as a phone's, the document's tab menu opens the same panel.
- **Search all projects** from the start page: names, the text of every document, cards and comments, opening the project at what was found.
  Each document is read once into an index kept in the browser, which the page says while it happens.
- **Jump by keyboard** with Ctrl+P or Ctrl+G: type a page number, or part of a document's name, a contents entry, a bookmark, a canvas, a tag or an action, then the arrow keys and Enter.
  It acts on the document pane last used.
- **Defined terms** in contracts: terms defined as `"Term" means`, `"Term" shall mean`, `(the "Term")` or `(hereinafter "Term")` are underlined where they are used, and pointing at one, or tapping it, shows its definition with a way to go to it.
  The squeeze panel of a document that defines terms has a switch to turn this off and on.
- **Undo and redo** with Ctrl+Z and Ctrl+Shift+Z, page edits included.
- **Folders** on the start page: file projects in folders from a project's folder button or by dragging, rename, collapse and delete them (their projects are kept).
  Projects are listed by when they were last opened.
- **Export notes** as Markdown, PDF or Word, with groups as sections, each excerpt's source and page, its tags, and the passages linked to it.
- **Send** to another app through the system's share sheet: a document, as it is or with its annotations, from its menu, and the notes and documents as one PDF from Export notes.
  Where the browser cannot share files, they are downloaded instead.
- **Export the canvas as a picture** from the Export menu (on a phone, from the canvas tools): PNG at 1×, 2× or 3×, PDF on one page the size of the canvas or across A4 or Letter pages, or SVG.
  All of the canvas or only the selected cards, cropped to them with a margin, in the light theme or matching the one in use.
  It shows excerpts, notes, figures, handwriting, groups (a collapsed one as its name), links and linked passages, but not handles, selection, the minimap or the controls.
- **Dark and sepia pages**: the page colours button in a document's toolbar shows pages light, dark or sepia, or dark only while the app's theme is, on this device.
  Dark pages keep their highlights' colours and turn handwriting light with the text; pictures on the page stay as they are unless _Keep images as they are_ is turned off.
  Exported files are not changed.
- **Phones**: one side at a time, touch selection, and pinch to zoom the page.
- **Sync and work together**, end-to-end encrypted, when you choose to share a project.
  Type @ in a note or comment to mention someone who has been in the project; the bell lists mentions, replies and what the others did since you last looked.

## Sync and sharing

A project stays on its device until you press **Share** in its header and create a link.
Open the link on another device, or send it to someone, and the project appears there with its PDFs, then stays in step: excerpts, notes, links, comments, linked passages, tags, handwriting, squeezes, canvases, bookmarks, page edits, replaced documents, the documents' order, pins and folders, and the project's name.
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

## Pictures of the canvas and page colours

A picture of the canvas is taken of a copy drawn out of sight in its own React Flow, with nothing selected, and captured with [html-to-image](https://github.com/bubkoo/html-to-image), which embeds the Inter font and the figures' images.
A picture too large for the browser to hold (beyond 16384 pixels a side or 40 million pixels) is drawn at a smaller scale, and the dialog says so.
The PDF holds the picture at 2× as one image, so its text cannot be selected.
The SVG wraps the cards as HTML, so it opens in browsers but not in most drawing programs.

Dark pages are the page's canvas turned negative with its hues turned back (`invert` and `hue-rotate` filters), so text stays selectable and nothing is drawn twice.
Pictures are found by following the page's drawing operations; one covering most of the page is taken for a scan and turns with the page.
Figure cards on the canvas always show the figure as printed, as a picture of the canvas does.

## Page tools

Each edit is written with pdf-lib into a new version of the file, stored beside the old one, and the document switches to it in one step.
The page tree is rewritten in place, so the table of contents, links, forms and metadata stay, and objects nothing refers to any more are dropped, so deleting pages makes the file smaller.
A duplicated page shares its original's content but not its links or form fields.
A squeeze is kept only where it still hides the same pages, unturned; others are opened.
Undo switches back to the earlier version, which is kept while the undo history needs it; the history keeps the last ten versions of files, and older page edits drop out of it.
A password protected PDF cannot be rewritten: page tools ask for a copy without the password.

## Text recognition

Gloss looks for pages that draw an image but have fewer than 20 letters of text.
Reading them uses [Tesseract](https://github.com/naptha/tesseract.js) in its own Web Worker, with its WebAssembly core and language data served from Gloss's own address, never a CDN: the pictures never leave the browser.
Those files (about 2.8 MB for the core, 2.9 MB for English and 1.4 MB for Hindi, compressed data) are fetched the first time text is read and kept by the service worker, so from then on reading works offline; they are not part of the app's own download, and the code that drives them loads only when reading starts.
Each page is drawn at about 300 dots per inch and read; each word is written with pdf-lib as invisible text (render mode 3) in Noto Sans or Noto Sans Devanagari, stretched to the width of its picture, with one size for each line from its tallest letters to its baseline.
Devanagari is written unshaped, as pdf-lib cannot shape it: the letters are in reading order, so copying and searching work, and only an invisible glyph's shape is off.
Words in other scripts, and words read with low confidence, are left out.
The result is a new version of the file, like a page edit: one step to undo, and shared with the others in a synced project.
Cancelling leaves the document as it was.
A password protected PDF cannot be rewritten, so reading it needs a copy without the password.

## Annotations from other apps

When a PDF is added, Gloss reads its annotations with pdf.js and asks before bringing them in.
Highlights, underlines, strike-outs and squiggles become highlights in the nearest of Gloss's 32 colours, over the words they marked, with the annotation's note and its replies as the comment.
A sticky note becomes a comment on the line of text beside it; with no text within an inch, it becomes a note on the canvas, and Gloss says which.
A text box becomes a Gloss text box in the same place, with its letters the same size.
Ink becomes handwriting on the page, in the nearest ink.
The originals are then taken out of the file, with their pop-ups and replies, in a new version of it, rather than hidden while drawing: so they are not drawn twice, the exported PDF has each annotation once, and other devices in a synced project get the same file.
Other annotations (links, forms, shapes, stamps) stay in the PDF as they were, and all of it is one step to undo.

## Replacing a document

The new version's words are read with pdf.js, and each highlight is looked for by its own words with the words around it: every word votes for where the passage would start, the likeliest places are aligned word by word, allowing for words added, dropped or changed, and the words around it and the page it was on break ties.
At least three in five of its words must be found in order, all of them for a passage of two or three words, and a single word needs the words around it.
A highlight found takes the new words' boxes, and its text becomes theirs.
Figures, handwriting, squeezes and bookmarks move with the words nearest them; where no words are near, as on a page of pictures, they stay at the same place on the same page, and the report says so.
A squeeze whose ends cannot both be found is opened.
The new file is stored as a version of the document, as a page edit is, so it syncs and undoes the same way.
Text is matched as pdf.js reads it, so a scanned version needs its text made selectable first, and a passage rewritten beyond recognition is left unplaced rather than guessed.

## Zotero

Gloss calls the Zotero Web API from the browser, which it allows, so nothing goes through Gloss's server.
The key and user ID are kept in this browser's storage only.
Make a key at [zotero.org/settings/keys](https://www.zotero.org/settings/keys): read access to the library is enough to import, and write access lets notes be sent back.
Only PDFs stored in Zotero (imported files) can be added; linked files live on the computer that linked them.
The tests point Gloss at a local stand-in for the API by setting `gloss:zotero-api` in local storage; unset, as for everyone else, it talks to `api.zotero.org`.

## Documents as one PDF

Each document is exported annotated, as on its own, and its pages are copied in; links between its passages are pointed at the copied pages.
The outline has an entry for each document holding its bookmarks; documents' own tables of contents are not carried into the combined file.
The canvas page is the picture the Export menu makes of the canvas, in the light theme, on a page its own size.

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

# Gloss

Read PDFs next to an infinite canvas.
Pull passages out of your documents, arrange and connect them, add your own notes, and jump back to the exact line any excerpt came from.

Everything runs in the browser.
PDFs and notes are kept in the browser's own storage (IndexedDB), and there is no account.
Nothing is uploaded unless you share a project, and then only encrypted.

## What it does

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
- **Export notes** as Markdown, with groups as sections and each excerpt's source and page.
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

The end-to-end tests build the app, drive it in Chromium on a desktop and a phone viewport, and leave screenshots and the exported notes in `test-results/artifacts/`.
The sync test runs against the Worker under wrangler with three browser contexts as three devices, and checks that no WebSocket frame or uploaded file holds any of the text or PDF in the clear.
Set `CHROMIUM` to a system Chromium where Playwright's own browser download is unavailable, and `BASE_URL` to test a deployed copy instead.

## Contributing

Issues and pull requests are welcome at [manyxlabs/gloss](https://github.com/manyxlabs/gloss).

## License

MIT

# Gloss

Read PDFs next to an infinite canvas.
Pull passages out of your documents, arrange and connect them, add your own notes, and jump back to the exact line any excerpt came from.

Everything runs in the browser.
PDFs and notes are kept in the browser's own storage (IndexedDB), nothing is uploaded, and there is no account.

## What it does

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
- **Export notes** as Markdown, with groups as sections and each excerpt's source and page.
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

The end-to-end tests build the app, drive it in Chromium on a desktop and a phone viewport, and leave screenshots and the exported notes in `test-results/artifacts/`.
Set `CHROMIUM` to a system Chromium where Playwright's own browser download is unavailable, and `BASE_URL` to test a deployed copy instead.

## Contributing

Issues and pull requests are welcome at [manyxlabs/gloss](https://github.com/manyxlabs/gloss).

## License

MIT

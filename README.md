# Margin

Read PDFs next to an infinite canvas.
Pull passages out of your documents, arrange and connect them, add your own notes, and jump back to the exact line any excerpt came from.

Everything runs in the browser.
PDFs and notes are kept in the browser's own storage (IndexedDB), nothing is uploaded, and there is no account.

## What it does

- **Excerpts that link back.** Select text and press Excerpt, or drag the selection onto the canvas. The card opens the document at the passage, and clicking the passage shows its card.
- **Highlights** in five colours, kept apart from excerpts until you want them on the canvas.
- **Several documents in one project**, in tabs, all feeding the same canvas.
- **Notes and links.** Double-click the canvas to write a note, and drag from a card's edge onto another card to connect them.
- **Search everything**: every page of every PDF and every card, with Ctrl+K.
- **Undo and redo** with Ctrl+Z and Ctrl+Shift+Z.
- **Export notes** as Markdown, with each excerpt's source and page.
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

Issues and pull requests are welcome at [manyxlabs/margin](https://github.com/manyxlabs/margin).

## License

MIT

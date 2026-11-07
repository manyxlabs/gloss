/**
 * Every string Gloss shows, in English. Each other language's catalogue is typed as `Messages`, so a key
 * missing from one, or one it has that English does not, fails the type check.
 * Values are strings, or functions for those with something in them. `<tag>…</tag>` marks words that
 * are drawn differently (see rich.tsx); `#` in a `plural` form is the number.
 */
export const en = {
  /** The pages' titles, descriptions and the text for crawlers and visitors without JavaScript, written into each language's HTML by vite.config.ts. */
  meta: {
    title: 'Gloss · Free PDF reader with a canvas for your notes',
    description: 'Read PDFs, Word files and web pages next to a canvas. Pull out passages, connect them, write by hand and jump back to the source. Free, private, no account.',
    ogTitle: 'Gloss · Read your documents next to a canvas for your thinking',
    ogDescription: 'Pull passages out of PDFs, arrange and connect them, write by hand, and jump back to the exact line. Free, private, in your browser.',
    ogImageAlt: 'Gloss: a document with highlighted passages linked to cards on a canvas',
    appDescription:
      'A free web app for active reading: read PDFs, Word and PowerPoint files and web pages next to an infinite canvas, excerpt passages into linked cards, handwrite, search everything and export annotated PDFs. Works offline, with end-to-end encrypted sharing.',
    privacyTitle: 'Privacy · Gloss',
    privacyDescription: 'How Gloss keeps your documents and notes: in your browser, with no account, no ads and no tracking, and shared projects end-to-end encrypted.',
    noscriptHeading: 'Gloss: read your documents next to a canvas for your thinking',
    noscriptIntro:
      'Pull passages out of your documents, arrange and connect them, write by hand, and jump back to the exact line any excerpt came from. Free, private, in your browser, with no account.',
    noscriptPoints: {
      excerpts: 'Excerpts that remember: every card opens the document at the passage it came from.',
      squeeze: 'Squeeze the pages between: read two distant passages side by side.',
      hand: 'Write by hand on the page or the canvas with a finger, mouse or stylus.',
      search: 'Search every page of every PDF and every note.',
      export: 'Export the PDF with highlights and handwriting, or your notes as Markdown, PDF or Word.',
      open: 'Open PDFs, Word, PowerPoint, images and web pages, from your device, Google Drive or Dropbox.',
      private: 'Private by design: files stay in your browser; shared projects are end-to-end encrypted.',
    },
    noscriptFoot: 'Gloss needs JavaScript. <privacy>Privacy policy</privacy> · Made by <maker>Manyx Labs</maker>',
  },
  language: 'Language',
  common: {
    dismiss: 'Dismiss',
    allProjects: 'All projects',
    byManyx: 'by Manyx Labs',
  },
  app: {
    brokenLinkTitle: 'This share link is not complete',
    brokenLink: 'Part of the link is missing, so the project it shares cannot be opened. Ask for the link again, and copy all of it, up to the very end.',
  },
  updates: {
    ready: 'A new version of Gloss is ready.',
    offline: 'Gloss now works offline on this device.',
    reload: 'Reload',
  },
  theme: {
    useLight: 'Use light theme',
    useDark: 'Use dark theme',
    light: 'Light theme',
    dark: 'Dark theme',
  },
  library: {
    features: {
      excerpts: { title: 'Excerpts that remember', text: 'Every card opens the document at the passage it came from, and every passage shows its card.' },
      squeeze: { title: 'Squeeze the pages between', text: 'Pinch two distant passages together, or select what is in between and squeeze it, to read them side by side.' },
      hand: { title: 'Write by hand', text: 'Draw on the page or the canvas with a finger, a mouse or a stylus, which writes even without picking the pen.' },
      search: { title: 'Search everything', text: 'One box searches every page of every PDF and every note you wrote.' },
      export: { title: 'Take it with you', text: 'Export the PDF with your highlights and handwriting as real annotations, or your notes as Markdown, PDF or Word.' },
      private: { title: 'Private by design', text: 'Your PDFs and notes stay in this browser unless you share a project, and then only encrypted. There is no account.' },
    },
    illustration: 'A page with highlighted passages linked to cards beside it',
    restoreAgain: (name: string) => `“${name}”, the project in this backup, is already here. Restore a copy of it?`,
    restoredBefore: (name: string) => `This backup was already restored as “${name}”. Restore another copy?`,
    notRestored: (file: string) => `${file} could not be restored.`,
    findingFiles: 'Finding the files…',
    addingFiles: 'Adding files',
    opening: 'Opening…',
    openFiles: 'Open files',
    emptyProject: 'Start an empty project',
    openFolder: 'Open a folder',
    restoreBackup: 'Restore a backup',
    openFrom: 'Open from',
    dropHint: 'Or drop files or folders anywhere here:',
    opens: 'Opens:',
    kinds: { pdf: 'PDF', word: 'Word', powerpoint: 'PowerPoint', images: 'Images', text: 'Text', markdown: 'Markdown', web: 'Web pages', backup: '.gloss backup' },
    install: 'Install app',
    eyebrow: 'Free, private, in your browser',
    heading: 'Read your documents next to <em>a canvas for your thinking.</em>',
    intro: 'Pull passages out of your documents, arrange and connect them, write by hand, and jump back to the exact line any excerpt came from.',
  },
  footer: {
    source: 'Source on GitHub',
    problem: 'Report a problem',
    privacy: 'Privacy',
  },
  privacy: {
    heading: 'Privacy',
    updated: 'Last updated 4 November 2026',
    /** Shown above a translated policy only, with <en>…</en> linking to the English one; empty in English. */
    prevails: '',
    intro:
      'Gloss is made by Manyx Labs. It runs in your browser, and has no accounts, no ads and no tracking. We do not sell, rent or share anything about you, and we do not analyse how you use Gloss.',
    docsHeading: 'Your documents and notes',
    docs: "The documents you add, and everything you make with them (highlights, comments, cards, canvases and handwriting), are kept in your browser's own storage (IndexedDB) on your device. A few settings, such as the theme, are kept there too. Converting files and reading scanned pages happen on your device.",
    sharedHeading: 'Shared projects',
    shared:
      "When you share a project, your browser encrypts it before it leaves your device, with a key that is only in the share link. The link's key is in the part of the address that browsers never send to a server. Manyx Labs' server, a Cloudflare Worker, stores and relays the encrypted project between the devices that have the link, and cannot read it: not the documents, the notes, nor the names of who is there.",
    linkHeading: 'Adding from a link',
    link: "When you add a web page or a share link, its address goes to Gloss's server, which fetches the page or file for your browser, because a browser may not read other sites itself. The server passes it straight back and keeps neither the address nor what it fetched.",
    driveHeading: 'Google Drive',
    drive:
      "When you add from Google Drive, Google asks whether Gloss may open the files you pick. Gloss asks only for the <code>drive.file</code> permission, which reaches nothing in your Drive except the files you pick in Google's own picker. Your browser downloads those files straight from Google; they do not pass through Gloss's server. The sign in Google gives your browser is kept only in memory until you close or reload Gloss, is never sent to Gloss's server, and lasts at most an hour. You can take the permission back at any time at <connections>myaccount.google.com/connections</connections>.",
    driveUse:
      "Gloss's use of information received from Google APIs adheres to the <policy>Google API Services User Data Policy</policy>, including the Limited Use requirements. The files are used only to show them to you in Gloss, and are never used for advertising, sold, or seen by anyone at Manyx Labs.",
    dropboxHeading: 'Dropbox',
    dropbox:
      "When you add from Dropbox, Dropbox's own chooser opens, and Gloss is given a download link to each file you pick, and nothing else. Your browser downloads the files straight from Dropbox; they do not pass through Gloss's server.",
    zoteroHeading: 'Zotero',
    zotero: 'The Zotero key you enter is kept in this browser and sent only to Zotero.',
    removingHeading: 'Removing your data',
    removing:
      "Deleting a project, or clearing this site's data in your browser, removes what Gloss kept on your device. A shared project's encrypted copy stays on Gloss's server, where no one can read it; to have it removed, write to us.",
    contactHeading: 'Contact',
    contact: 'Questions about privacy go to <mail>manish@manyxlabs.com</mail>.',
  },
};

export type Messages = typeof en;

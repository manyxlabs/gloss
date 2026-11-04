// Kept apart from the converters so the start page can name the formats without loading them.
export const ACCEPT = 'application/pdf,.pdf,.docx,.pptx,.txt,.md,.markdown,image/*,.heic,.heif';

export type Kind = 'pdf' | 'image' | 'docx' | 'pptx' | 'text' | 'markdown';

export function kindOf(file: Pick<File, 'name' | 'type'>): Kind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || ext === 'pptx') return ext;
  if (ext === 'md' || ext === 'markdown' || file.type === 'text/markdown') return 'markdown';
  if (ext === 'txt' || file.type === 'text/plain') return 'text';
  if (/^(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/.test(ext) || file.type.startsWith('image/')) return 'image';
  return null;
}

export const refusal = (name: string) =>
  /\.(doc|ppt|rtf|odt|odp)$/i.test(name)
    ? `${name} is in an older or other office format. Save it as .docx or .pptx and add that.`
    : `${name} is not a file Gloss can open. Add PDFs, Word (.docx) or PowerPoint (.pptx) files, images, or text and Markdown files.`;

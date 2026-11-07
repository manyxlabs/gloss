import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, openProject, PHONE, shot } from './helpers';

const searchbox = (page: Page) => page.getByRole('searchbox', { name: 'Search documents and cards' });
const results = (page: Page) => page.getByRole('listbox', { name: 'Search results' });
const allActions = (page: Page) => page.getByRole('group', { name: 'Act on all matches' });
const highlightIds = (page: Page) => page.locator('.pdfViewer > .page .hl-layer .hl').evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLElement).dataset.id!))]);

async function actOnAll(page: Page, query: string) {
  await searchbox(page).fill(query);
  await results(page).getByRole('button', { name: 'Act on all matches' }).click();
  await expect(allActions(page)).toBeVisible();
}

/**
 * Where the words sit in the text layer, measured with ranges over its spans, beside where the
 * highlight's marks are drawn, both in screen pixels: a highlight anchored right covers the words.
 */
function measure(page: Page, words: string[], id: string) {
  return page.evaluate(
    ({ words, id }) => {
      const box = (r: DOMRect) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      const spans = [...document.querySelectorAll('.pdfViewer > .page .textLayer span')].filter((s) => !s.querySelector('span'));
      const text = words.map((w) => {
        const span = spans.find((s) => s.textContent!.includes(w))!;
        const node = [...span.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.includes(w))!;
        const at = node.textContent!.indexOf(w);
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + w.length);
        return box(range.getBoundingClientRect());
      });
      const marks = [...document.querySelectorAll<HTMLElement>(`.pdfViewer > .page .hl[data-id="${id}"]`)].map((m) => box(m.getBoundingClientRect())).sort((a, b) => a.y - b.y);
      return { text, marks };
    },
    { words, id },
  );
}

/** Whether a line of text is left in view by the squeezes: its middle is inside the stretch its page shows. */
const inView = (page: Page, text: string) =>
  page.evaluate((text) => {
    const span = [...document.querySelectorAll('.pdfViewer > .page .textLayer span')].find((s) => s.textContent!.includes(text))!;
    const div = span.closest<HTMLElement>('.page')!;
    const r = span.getBoundingClientRect();
    const p = div.getBoundingClientRect();
    const fy = (r.top + r.height / 2 - p.top) / p.height;
    return fy >= Number(div.dataset.from ?? 0) && fy <= Number(div.dataset.to ?? 1);
  }, text);

test('every match of a search becomes a highlight on its words, in one step, and is tagged, excerpted and linked in bulk', async ({ page }) => {
  await openProject(page);
  const report: Record<string, unknown> = {};

  await test.step('A match across two lines is highlighted on each of its lines', async () => {
    await actOnAll(page, 'process known');
    await allActions(page).getByRole('button', { name: 'Highlight all green' }).click();
    await expect(allActions(page).getByRole('status')).toHaveText('1 passage highlighted.');
    const [id] = await highlightIds(page);
    const { text, marks } = await measure(page, ['process', 'known'], id!);
    report.acrossLines = { text, marks };
    expect(marks).toHaveLength(2);
    for (const [i, t] of text.entries()) {
      const m = marks[i]!;
      // Within a few pixels of the words, on each side.
      expect(Math.abs(m.x - t.x), `left of line ${i}`).toBeLessThanOrEqual(3);
      expect(Math.abs(m.x + m.w - (t.x + t.w)), `right of line ${i}`).toBeLessThanOrEqual(3);
      expect(Math.abs(m.y + m.h / 2 - (t.y + t.h / 2)), `middle of line ${i}`).toBeLessThanOrEqual(3);
      expect(Math.abs(m.h - t.h), `height of line ${i}`).toBeLessThanOrEqual(3);
    }
  });

  await test.step('All matches in every document, then undone and redone as one step', async () => {
    await actOnAll(page, 'reef');
    await allActions(page).getByRole('button', { name: 'Highlight all yellow' }).click();
    await expect(allActions(page).getByRole('status')).toHaveText('3 passages highlighted.');
    await expect.poll(async () => (await highlightIds(page)).length).toBe(3);
    // A word inside a line: "reef" in "a reef without grazing fish".
    const ids = await highlightIds(page);
    const inside = await Promise.all(ids.map((id) => measure(page, ['reef without'], id)));
    const hit = inside.find((m) => m.marks.length === 1 && Math.abs(m.marks[0]!.x - m.text[0]!.x) <= 3)!;
    expect(hit, 'a highlight starts at "reef" in its line').toBeTruthy();
    const word = await page.evaluate(() => {
      const span = [...document.querySelectorAll('.pdfViewer > .page .textLayer span')].find((s) => s.textContent!.includes('reef without'))!;
      const node = [...span.childNodes].find((n) => n.textContent!.includes('reef without'))!;
      const range = document.createRange();
      const at = node.textContent!.indexOf('reef without');
      range.setStart(node, at);
      range.setEnd(node, at + 4);
      return range.getBoundingClientRect().width;
    });
    expect(Math.abs(hit.marks[0]!.w - word)).toBeLessThanOrEqual(3);
    report.insideLine = { ...hit, word };

    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await highlightIds(page)).length).toBe(1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(async () => (await highlightIds(page)).length).toBe(3);
  });

  await test.step('Tagging the matches in one document reuses their highlights', async () => {
    await searchbox(page).fill('reef');
    await results(page).getByRole('button', { name: 'Act on the matches in Reef essay' }).click();
    const actions = page.getByRole('group', { name: 'Act on the matches in Reef essay' });
    await actions.getByRole('button', { name: 'Tag all' }).click();
    await actions.getByRole('textbox', { name: 'Find or make a tag' }).fill('Reef');
    await page.keyboard.press('Enter');
    await expect(actions.getByRole('status')).toHaveText('2 passages tagged Reef.');
    await expect.poll(async () => (await highlightIds(page)).length).toBe(3);
    await searchbox(page).fill('#reef');
    await expect(results(page).getByRole('group', { name: 'Tagged passages' }).getByRole('option')).toHaveCount(2);
  });

  await test.step('Excerpting all lays the passages out in a group, as one step', async () => {
    await actOnAll(page, 'reef');
    await allActions(page).getByRole('button', { name: 'Excerpt all' }).click();
    const group = page.locator('.react-flow__node').filter({ has: page.locator('.group') });
    await expect(group).toHaveCount(1);
    await expect(group.getByRole('textbox', { name: 'Group name' })).toHaveValue('Search: reef');
    const cards = page.locator('.react-flow__node').filter({ has: page.locator('.card.excerpt') });
    await expect(cards).toHaveCount(3);
    // Settled into rows once measured: inside the group, and none over another.
    await page.waitForTimeout(500);
    const g = (await group.boundingBox())!;
    const boxes = await Promise.all((await cards.all()).map(async (c) => (await c.boundingBox())!));
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(g.x);
      expect(b.y).toBeGreaterThanOrEqual(g.y);
      expect(b.x + b.width).toBeLessThanOrEqual(g.x + g.width + 1);
      expect(b.y + b.height).toBeLessThanOrEqual(g.y + g.height + 1);
    }
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    await expect.poll(async () => (await highlightIds(page)).length).toBe(3);
    await shot(page, 'bulk-excerpt-group');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(group).toHaveCount(0);
    await expect(cards).toHaveCount(0);
    await expect.poll(async () => (await highlightIds(page)).length).toBe(3);
  });

  await test.step('Linking all ties every passage to a new note', async () => {
    await actOnAll(page, 'reef');
    await allActions(page).getByRole('button', { name: 'Link all' }).click();
    await allActions(page).getByRole('button', { name: 'To a new note' }).click();
    await expect(page.locator('.card .grow[data-value="Search: “reef”"]')).toBeVisible();
    // Each passage in the essay now names the note in its margin.
    await expect(page.locator('.pdfViewer > .page .link-mark')).toHaveCount(2);
    await expect(page.locator('.pdfViewer > .page .link-mark').first()).toHaveAttribute('title', /Card: Search: “reef”/);
    await shot(page, 'bulk-linked');
  });

  writeFileSync(`${ARTIFACTS}/bulk-anchors.json`, JSON.stringify(report, null, 2));
});

test('a document squeezes down to search matches or highlights with lines of context, and opens again in one step', async ({ page }) => {
  await openProject(page);

  await test.step('To the matches of a search, from the search results', async () => {
    await searchbox(page).fill('bleaching');
    await results(page).getByRole('button', { name: 'Act on the matches in Reef essay' }).click();
    await page.getByRole('group', { name: 'Act on the matches in Reef essay' }).getByRole('button', { name: 'Squeeze to matches' }).click();
    await expect(results(page)).toHaveCount(0);
    await expect(page.locator('.fold-bar').first()).toBeVisible();
    // Two lines of context above the match, the rest of the document hidden.
    expect(await inView(page, 'known as bleaching')).toBe(true);
    expect(await inView(page, 'Rising sea temperatures')).toBe(true);
    expect(await inView(page, 'of all marine species')).toBe(true);
    expect(await inView(page, 'Coral reefs occupy')).toBe(false);
    expect(await inView(page, 'The ocean covers')).toBe(false);
    await expect(page.locator('.pdfViewer > .page[data-page-number="2"]')).toHaveAttribute('data-from', '-1');
    for (const scheme of ['light', 'dark'] as const) {
      await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
      await page.waitForTimeout(300);
      await shot(page, `collapse-matches-${scheme}`);
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  });

  await test.step('With no context, only the line of the match shows; undo brings back the squeeze before', async () => {
    await page.getByRole('button', { name: 'Squeeze around highlights or words' }).click();
    const panel = page.getByRole('dialog', { name: 'Squeeze the document' });
    await panel.getByRole('radio', { name: 'Search matches' }).click();
    await expect(panel.getByRole('textbox', { name: 'Words to squeeze around' })).toHaveAttribute('placeholder', 'bleaching');
    await panel.getByRole('slider').fill('0');
    await expect(panel).toContainText('0 lines of context');
    await shot(page, 'collapse-panel');
    await panel.getByRole('button', { name: 'Squeeze' }).click();
    await expect(panel).toHaveCount(0);
    await expect.poll(() => inView(page, 'Rising sea temperatures')).toBe(false);
    expect(await inView(page, 'known as bleaching')).toBe(true);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => inView(page, 'Rising sea temperatures')).toBe(true);
  });

  await test.step('To the highlights of a colour, then everything opens with Expand all', async () => {
    await page.getByRole('button', { name: 'Squeeze around highlights or words' }).click();
    const panel = page.getByRole('dialog', { name: 'Squeeze the document' });
    await panel.getByRole('button', { name: 'Expand all' }).click();
    await expect(page.locator('.fold-bar')).toHaveCount(0);

    await searchbox(page).fill('marine protected');
    await results(page).getByRole('button', { name: 'Act on all matches' }).click();
    await allActions(page).getByRole('button', { name: 'Highlight all pink' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Squeeze around highlights or words' }).click();
    await panel.getByRole('radio', { name: 'Highlights' }).click();
    await panel.getByRole('group', { name: 'Highlight colour' }).getByRole('button', { name: 'pink', exact: true }).click();
    await panel.getByRole('slider').fill('1');
    await panel.getByRole('button', { name: 'Squeeze' }).click();
    await expect.poll(() => inView(page, 'The ocean covers')).toBe(false);
    await page.locator('.pdfViewer > .page[data-page-number="2"]').scrollIntoViewIfNeeded();
    expect(await inView(page, 'Marine protected areas')).toBe(true);
    expect(await inView(page, 'smothered by seaweed')).toBe(true);
    expect(await inView(page, 'Mangrove forests protect')).toBe(false);
    await shot(page, 'collapse-highlights');

    await page.getByRole('button', { name: 'Squeeze around highlights or words' }).click();
    await panel.getByRole('button', { name: 'Expand all' }).click();
    await expect(page.locator('.fold-bar')).toHaveCount(0);
    expect(await inView(page, 'Mangrove forests protect')).toBe(true);
  });
});

test('on a phone, the actions on search results and the squeeze panel fit the screen', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  await page.getByRole('button', { name: 'Search', exact: true }).tap();
  await searchbox(page).fill('reef');
  await results(page).getByRole('button', { name: 'Act on all matches' }).tap();
  await allActions(page).getByRole('button', { name: 'Tag all' }).tap();
  const box = (await allActions(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
    await page.waitForTimeout(300);
    await shot(page, `bulk-phone-${scheme}`);
  }
  await allActions(page).getByRole('button', { name: 'Highlight all blue' }).tap();
  await expect(allActions(page).getByRole('status')).toHaveText('3 passages highlighted.');
  await searchbox(page).press('Escape');
  await expect(results(page)).toHaveCount(0);

  // A phone's toolbar has no room for the squeeze button; the document's tab menu opens the panel.
  await expect(page.getByRole('button', { name: 'Squeeze around highlights or words' })).toBeHidden();
  await page.getByRole('button', { name: 'More for this document' }).tap();
  await page.getByRole('menuitem', { name: 'Squeeze and defined terms…' }).tap();
  const panel = page.getByRole('dialog', { name: 'Squeeze the document' });
  const p = (await panel.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(390);
  await shot(page, 'collapse-phone-dark');
  await panel.getByRole('button', { name: 'Squeeze' }).tap();
  await expect(page.locator('.fold-bar').first()).toBeVisible();
  await context.close();
});

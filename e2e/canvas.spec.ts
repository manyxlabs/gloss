import { expect, test, type Page } from '@playwright/test';
import { card, openProject, select, shot } from './helpers';

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

const note = (page: Page, text: string) => page.locator('.react-flow__node').filter({ has: page.locator(`.grow[data-value="${text}"]`) });
const group = (page: Page) => page.locator('.react-flow__node').filter({ has: page.locator('.group') });
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Chosen on the canvas' });
const nodes = (page: Page) => page.locator('.react-flow__node');

async function write(page: Page, x: number, y: number, text: string) {
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + x, flow.y + y);
  await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
  await page.keyboard.type(text);
}
const clickPane = (page: Page) => page.locator('.react-flow__pane').click({ position: { x: 300, y: 560 } });

/** Drags a card by its margin, where the mouse takes the card rather than its text. */
async function drag(page: Page, text: string, to: { x: number; y: number }, during?: () => Promise<void>) {
  const from = (await note(page, text).boundingBox())!;
  await page.mouse.move(from.x + 5, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(to.x + 5, to.y + 5, { steps: 15 });
  await during?.();
  await page.mouse.up();
}

test('a card dragged out of its group leaves it, the group fits what is left, and a card dragged in joins', async ({ page }) => {
  await openProject(page);
  await write(page, 80, 160, 'Alpha');
  await write(page, 80, 280, 'Beta');
  await clickPane(page);
  await note(page, 'Alpha').click({ position: { x: 4, y: 4 } });
  await note(page, 'Beta').click({ position: { x: 4, y: 4 }, modifiers: ['ControlOrMeta'] });
  await bar(page).getByRole('button', { name: 'Group' }).click();
  // A new group is ready to be named.
  await expect(group(page).getByRole('textbox', { name: 'Group name' })).toBeFocused();
  await page.keyboard.type('Pair');
  await clickPane(page);

  const before = (await group(page).boundingBox())!;
  const beta = (await note(page, 'Beta').boundingBox())!;
  await drag(page, 'Beta', { x: beta.x + 340, y: before.y + before.height + 120 }, async () => {
    // The group does not stretch after the card while it is dragged.
    expect((await group(page).boundingBox())!.height).toBeCloseTo(before.height, 0);
    await shot(page, 'group-drag-out');
  });
  const after = (await group(page).boundingBox())!;
  const left = (await note(page, 'Beta').boundingBox())!;
  expect(after.height).toBeLessThan(before.height - 60);
  expect(left.y).toBeGreaterThan(after.y + after.height);
  const alpha = (await note(page, 'Alpha').boundingBox())!;
  expect(after.y + after.height - (alpha.y + alpha.height)).toBeCloseTo(20, -1);

  // Moving the group now leaves Beta where it is.
  await page.mouse.move(after.x + 8, after.y + after.height / 2);
  await page.mouse.down();
  await page.mouse.move(after.x + 68, after.y + after.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  expect((await note(page, 'Beta').boundingBox())!.x).toBeCloseTo(left.x, 0);
  expect((await note(page, 'Alpha').boundingBox())!.x - alpha.x).toBeGreaterThan(40);

  // Dragged back in, it joins, and the group grows around it.
  const moved = (await group(page).boundingBox())!;
  await drag(page, 'Beta', { x: moved.x + 30, y: moved.y + moved.height - 50 });
  const joined = (await group(page).boundingBox())!;
  const inside = (await note(page, 'Beta').boundingBox())!;
  expect(joined.y + joined.height).toBeGreaterThan(inside.y + inside.height);
  await group(page).getByRole('button', { name: 'Collapse group' }).click();
  await expect(group(page)).toContainText('2 cards');
  await shot(page, 'group-joined-collapsed');
});

test('a group deleted on its own leaves its cards, unless they were chosen with it', async ({ page }) => {
  await openProject(page);
  await write(page, 80, 160, 'Kept one');
  await write(page, 80, 280, 'Kept two');
  await clickPane(page);
  await note(page, 'Kept one').click({ position: { x: 4, y: 4 } });
  await note(page, 'Kept two').click({ position: { x: 4, y: 4 }, modifiers: ['ControlOrMeta'] });
  await bar(page).getByRole('button', { name: 'Group' }).click();
  await clickPane(page);

  const g = (await group(page).boundingBox())!;
  await page.mouse.click(g.x + 8, g.y + g.height - 8);
  await bar(page).getByRole('button', { name: 'Delete group' }).click();
  await expect(group(page)).toHaveCount(0);
  await expect(nodes(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(group(page)).toHaveCount(1);

  // Chosen together with one of its cards, the group goes with that card only.
  await page.mouse.click(g.x + 8, g.y + g.height - 8);
  await note(page, 'Kept two').click({ position: { x: 4, y: 4 }, modifiers: ['ControlOrMeta'] });
  await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(1);
  await expect(note(page, 'Kept one')).toBeVisible();
});

test('the chosen cards and links can be deleted, grouped, undone and redone without the keyboard', async ({ page }) => {
  await openProject(page);
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await write(page, 80, 160, 'From');
  await write(page, 420, 360, 'To');
  await clickPane(page);

  const from = note(page, 'From');
  await from.hover();
  const handle = (await from.locator('.react-flow__handle-right').boundingBox())!;
  const to = (await note(page, 'To').boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  // A link, chosen, can be deleted from the bar beside it.
  await page.locator('.react-flow__edge').click();
  await bar(page).getByRole('button', { name: 'Delete link' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await undo.click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  // A card, chosen, likewise, with its links.
  await from.click({ position: { x: 4, y: 4 } });
  await expect(bar(page).getByRole('button', { name: 'Group' })).toHaveCount(0);
  await shot(page, 'selection-bar');
  await bar(page).getByRole('button', { name: 'Delete card' }).click();
  await expect(from).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await undo.click();
  await expect(from).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await redo.click();
  await expect(from).toHaveCount(0);
  await undo.click();

  // Ctrl+A on the canvas chooses its cards, not the text of the page.
  await clickPane(page);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('');
  await bar(page).getByRole('button', { name: 'Group' }).click();
  await expect(group(page)).toHaveCount(1);
  // Hidden while the cards it is for are dragged.
  const g = (await group(page).boundingBox())!;
  await page.mouse.move(g.x + 8, g.y + g.height - 8);
  await page.mouse.down();
  await page.mouse.move(g.x + 40, g.y + g.height + 20, { steps: 6 });
  await expect(bar(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(bar(page)).toBeVisible();
});

test('on a touch screen, a card is deleted and brought back with buttons alone', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  await page.getByRole('tab', { name: 'Canvas', exact: true }).tap();
  await page.getByRole('button', { name: 'Note', exact: true }).tap();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Written on a phone');
  await page.locator('.react-flow__pane').tap({ position: { x: 200, y: 600 } });
  const written = note(page, 'Written on a phone');
  await written.tap({ position: { x: 4, y: 4 } });
  await expect(bar(page)).toBeInViewport();
  await shot(page, 'phone-selection-bar');
  await bar(page).getByRole('button', { name: 'Delete card' }).tap();
  await expect(written).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(written).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).tap();
  await expect(written).toHaveCount(0);
  await context.close();
});

test('a note left empty goes, and typing in a note undoes as the browser does', async ({ page }) => {
  await openProject(page);
  const undo = page.getByRole('button', { name: 'Undo' });
  await write(page, 80, 160, '');
  await clickPane(page);
  await expect(nodes(page)).toHaveCount(0);
  // Gone with the step that made it, so there is nothing to undo.
  await expect(undo).toBeDisabled();

  await write(page, 80, 160, 'Hello world');
  const field = page.getByRole('textbox', { name: 'Note' });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(field).not.toHaveValue(/^Hello worl$|^Hello world$/);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(field).toHaveValue('Hello world');
  await clickPane(page);

  // Out of the field, undo takes back the typing as one step, then the note.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(field).toHaveValue('');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(nodes(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(field).toHaveValue('Hello world');
});

test('a card that grows pushes the card below it down, and a long passage folds to its first lines', async ({ page }) => {
  await openProject(page);
  await select(page, 'Coral reefs occupy', 'of all marine species.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  const coral = card(page, 'Coral reefs occupy');
  await page.getByRole('button', { name: 'Note', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Right below');
  const below = page.locator('.react-flow__node').filter({ has: page.locator('.grow[data-value="Right below"]') });
  await clickPane(page);
  const gap = async () => (await below.boundingBox())!.y - ((await coral.boundingBox())!.y + (await coral.boundingBox())!.height);
  expect(await gap()).toBeGreaterThan(0);
  await coral.getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('One\nTwo\nThree\nFour\nFive');
  await expect.poll(gap).toBeGreaterThan(8);
  await shot(page, 'card-grew');

  // Zoomed out, so a passage across two pages is in view to select.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await select(page, 'The ocean covers', 'smothered by seaweed.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  const long = card(page, 'The ocean covers');
  const quote = long.locator('blockquote');
  // Its own height, which the canvas's zoom, still easing towards the new card, does not change.
  const height = () => quote.evaluate((el: HTMLElement) => el.offsetHeight);
  const folded = await height();
  await long.getByRole('button', { name: 'Show all' }).click();
  expect(await height()).toBeGreaterThan(folded + 40);
  await long.getByRole('button', { name: 'Show less' }).click();
  expect(await height()).toBe(folded);
});

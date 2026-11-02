import { expect, test, type Page } from '@playwright/test';
import { openProject, pdf, shot } from './helpers';

const panel = (page: Page) => page.getByRole('dialog', { name: 'All documents' });
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open documents' }).first().getByRole('tab');
const openPanel = async (page: Page) => {
  if (!(await panel(page).isVisible())) await page.getByRole('button', { name: 'All documents' }).first().click();
  await expect(panel(page)).toBeVisible();
};

async function addGuide(page: Page) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add file' }).click()]);
  await chooser.setFiles(await pdf('Field guide.pdf', [['A field guide to reef fish, with notes on parrotfish, wrasse and the grazers that keep algae down.']]));
  await expect(tabs(page)).toHaveCount(3);
}

test('documents are filed in folders, pinned first and reordered by dragging their tabs, and it all stays', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProject(page);
  await addGuide(page);
  await openPanel(page);
  await expect(panel(page).getByRole('button', { name: /^Reef essay|^Survey notes|^Field guide/ })).toHaveCount(3);

  await test.step('A folder is made, named and given a document', async () => {
    await panel(page).getByRole('button', { name: 'New folder' }).click();
    const name = panel(page).getByRole('textbox', { name: 'Folder name' });
    await expect(name).toBeFocused();
    await page.keyboard.type('Surveys');
    await page.keyboard.press('Enter');
    await panel(page).getByRole('button', { name: 'Actions for Survey notes' }).click();
    await page.getByRole('menu', { name: 'Survey notes' }).getByRole('menuitemradio', { name: 'In Surveys' }).click();
    const folder = panel(page)
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: /^Surveys/ }) });
    await expect(folder.getByRole('button', { name: 'Survey notes', exact: true })).toBeVisible();
    await folder.getByRole('button', { name: /^Surveys/ }).click();
    await expect(folder.getByRole('button', { name: /^Surveys/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(folder.getByRole('button', { name: 'Survey notes', exact: true })).toHaveCount(0);
    await folder.getByRole('button', { name: /^Surveys/ }).click();
  });

  await test.step('A pinned document comes first, in the tabs and the list', async () => {
    await panel(page).getByRole('button', { name: 'Pin Field guide' }).click();
    await expect(panel(page).getByRole('button', { name: 'Unpin Field guide' })).toHaveAttribute('aria-pressed', 'true');
    await expect(tabs(page)).toHaveText(['Field guide', 'Reef essay', 'Survey notes']);
    await expect(panel(page).locator('.doc-group').first()).toContainText('Pinned');
    await page.mouse.move(1000, 600);
    await shot(page, 'docs-panel');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
  });

  await test.step('A tab dragged before another moves there', async () => {
    const survey = tabs(page).filter({ hasText: 'Survey notes' }).locator('..');
    const reef = tabs(page).filter({ hasText: 'Reef essay' }).locator('..');
    await survey.dragTo(reef, { targetPosition: { x: 4, y: 10 } });
    await expect(tabs(page)).toHaveText(['Field guide', 'Survey notes', 'Reef essay']);
    // Dropped among the others, not the pinned one, it stays unpinned.
    await openPanel(page);
    await expect(panel(page).getByRole('button', { name: 'Pin Survey notes' })).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
  });

  await test.step('Moved from its menu, and undone', async () => {
    await openPanel(page);
    await panel(page).getByRole('button', { name: 'Actions for Reef essay' }).click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    await expect(tabs(page)).toHaveText(['Field guide', 'Reef essay', 'Survey notes']);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await expect(tabs(page)).toHaveText(['Field guide', 'Survey notes', 'Reef essay']);
  });

  await test.step('All of it is kept', async () => {
    await page.reload();
    await expect(tabs(page)).toHaveText(['Field guide', 'Survey notes', 'Reef essay']);
    await expect(tabs(page).first().getByLabel('Pinned')).toBeVisible();
    await openPanel(page);
    const folder = panel(page)
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: /^Surveys/ }) });
    await expect(folder.getByRole('button', { name: 'Survey notes', exact: true })).toBeVisible();
  });

  await test.step('A folder deleted keeps its documents', async () => {
    await panel(page).getByRole('button', { name: 'Actions for folder Surveys' }).click();
    await page.getByRole('menuitem', { name: 'Delete folder' }).click();
    await expect(panel(page).getByRole('button', { name: /^Surveys/ })).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Survey notes', exact: true })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Survey notes', exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(tabs(page).filter({ hasText: 'Survey notes' })).toHaveAttribute('aria-selected', 'true');
  });
});

test('on a phone, the list of documents fits the screen and opens one', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);
  await addGuide(page);
  await page.getByRole('button', { name: 'All documents' }).first().tap();
  const box = (await panel(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const b of await panel(page).getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  await shot(page, 'docs-panel-phone');
  await panel(page).getByRole('button', { name: 'Reef essay', exact: true }).tap();
  await expect(tabs(page).filter({ hasText: 'Reef essay' })).toHaveAttribute('aria-selected', 'true');
  await context.close();
});

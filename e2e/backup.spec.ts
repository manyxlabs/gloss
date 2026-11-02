import { copyFileSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARTIFACTS, card, openProject, select } from './helpers';

test('a backup brings a project back whole, as many times as needed, without the copies sharing files', async ({ page }) => {
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await select(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Squeeze' }).click();
  await expect(page.locator('.fold-bar')).toHaveCount(1);
  await page.waitForTimeout(500);

  await page.goto('/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up Reef essay' }).click()]);
  expect(download.suggestedFilename()).toBe('Reef essay.gloss');
  const file = `${ARTIFACTS}/Reef essay.gloss`;
  copyFileSync(await download.path(), file);

  let answer = true;
  const asked: string[] = [];
  page.on('dialog', (d) => {
    asked.push(d.message());
    void (answer ? d.accept() : d.dismiss());
  });
  await expect(page.getByRole('link', { name: /Reef essay/ })).toContainText('2 documents · 1 card');
  await page.getByRole('button', { name: 'Delete Reef essay' }).click();
  await expect(page.getByRole('link', { name: /Reef essay/ })).toHaveCount(0);

  const restoreFrom = async () => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore a backup' }).click()]);
    await chooser.setFiles({ name: 'Reef essay.gloss', mimeType: 'application/octet-stream', buffer: readFileSync(file) });
  };
  await restoreFrom();
  await expect(page.getByRole('tab', { name: 'Survey notes' })).toBeVisible();
  await expect(card(page, 'Coral reefs')).toBeVisible();
  await expect(page.locator('.fold-bar')).toHaveCount(1);
  await card(page, 'Coral reefs')
    .getByRole('button', { name: /Reef essay · p\. 1/ })
    .click();
  await expect(page.locator('.page:not([data-copy]) .hl.flash')).toBeInViewport();

  // Restored a second time, once asked whether that is meant; then the first copy deleted: the second still has its PDFs.
  await page.goto('/');
  await restoreFrom();
  await expect.poll(() => asked.at(-1)).toBe('This backup was already restored as “Reef essay”. Restore another copy?');
  await expect(card(page, 'Coral reefs')).toBeVisible();
  await page.goto('/');
  answer = false;
  await restoreFrom();
  await expect.poll(() => asked.length).toBe(3);
  await expect(page.getByRole('link', { name: /Reef essay/ })).toHaveCount(2);
  answer = true;
  await page.getByRole('button', { name: 'Delete Reef essay' }).first().click();
  await expect(page.getByRole('link', { name: /Reef essay/ })).toHaveCount(1);
  await page.getByRole('link', { name: /Reef essay/ }).click();
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Survey notes' }).click();
  await expect(page.locator('.textLayer span', { hasText: 'Parrotfish' })).toBeVisible();

  // Anything else is refused with a reason.
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore a backup' }).click()]);
  await chooser.setFiles({ name: 'notes.gloss', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip') });
  await expect(page.getByRole('alert')).toHaveText('notes.gloss is not a Gloss backup.');
});

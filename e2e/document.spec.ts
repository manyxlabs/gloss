import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { card, openProject, select, shot } from './helpers';
import { makePdf } from './pdfs';

/** A PDF that opens only with `password`, encrypted by qpdf as a real protected file would be. */
async function encryptedPdf(password: string) {
  const dir = mkdtempSync(join(tmpdir(), 'gloss-'));
  writeFileSync(join(dir, 'plain.pdf'), await makePdf([['Confidential findings: the northern reef recovered faster than expected after the heatwave.']]));
  execFileSync('qpdf', ['--encrypt', password, `${password}-owner`, '256', '--', join(dir, 'plain.pdf'), join(dir, 'locked.pdf')]);
  return readFileSync(join(dir, 'locked.pdf'));
}

test('a password protected PDF asks for its password, refuses a wrong one and opens with the right one', async ({ page }) => {
  await openProject(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add PDF' }).click()]);
  await chooser.setFiles({ name: 'Locked survey.pdf', mimeType: 'application/pdf', buffer: await encryptedPdf('coral') });

  const dialog = page.getByRole('dialog', { name: 'Password needed' });
  await expect(dialog).toContainText('“Locked survey.pdf” is protected.');
  await dialog.getByLabel('Password').fill('kelp');
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(dialog).toContainText('That password is not right.');
  await expect(dialog.getByLabel('Password')).toBeFocused();
  await shot(page, 'password-wrong');
  await dialog.getByLabel('Password').fill('coral');
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Locked survey' })).toHaveAttribute('aria-selected', 'true');

  await select(page, 'Confidential findings');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Confidential findings')).toBeVisible();

  // The password is kept with the project in this browser, so it opens again without asking.
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('tab', { name: 'Locked survey' }).click();
  await expect(page.locator('.textLayer span', { hasText: 'Confidential findings' }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // pdf-lib cannot write into an encrypted file, and says so rather than producing a broken one.
  await page.getByRole('button', { name: 'Export PDF with highlights' }).click();
  await expect(page.getByRole('alert')).toContainText('password protected');

  // Cancelling leaves the project as it was.
  const [again] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add PDF' }).click()]);
  await again.setFiles({ name: 'Other.pdf', mimeType: 'application/pdf', buffer: await encryptedPdf('reef') });
  await page.getByRole('dialog', { name: 'Password needed' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('tab')).toHaveCount(3);
});

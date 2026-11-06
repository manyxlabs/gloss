import { expect, test } from '@playwright/test';
import { card, openProject, select, shot, worksOffline } from './helpers';

test('once visited, Gloss installs as an app and keeps working with no network', async ({ page, context, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Gloss', display: 'standalone', start_url: '/' });
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(`/${icon.src}`)).ok()).toBe(true);

  await page.goto('/');
  await worksOffline(page);
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Coral reefs')).toBeVisible();
  const project = page.url();
  await page.waitForTimeout(500);

  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Reef essay/ })).toBeVisible();
  await page.goto(project);
  // The PDF, the pdf.js worker and its fonts all come from this device.
  await expect(page.locator('.textLayer span', { hasText: 'Coral reefs occupy' }).first()).toBeVisible();
  await expect(card(page, 'Coral reefs')).toBeVisible();
  await select(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Rising sea')).toBeVisible();
  await shot(page, 'offline-workspace');
  await context.setOffline(false);
});

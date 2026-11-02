import type { Page } from '@playwright/test';

/** A note by its text, which is in a field rather than the card's own text. */
export const noteCard = (page: Page, text: string) => page.locator('.react-flow__node', { has: page.locator(`.grow[data-value="${text}"]`) });

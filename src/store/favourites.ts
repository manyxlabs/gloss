import { create } from 'zustand';
import { isColor } from '../palette';
import type { Color } from '../types';

const KEY = 'gloss:favourites';
export const DEFAULT_FAVOURITES: Color[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

function load(): Color[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length === DEFAULT_FAVOURITES.length && saved.every(isColor) && new Set(saved).size === saved.length) return saved;
  } catch {
    // Blocked or garbled storage: the defaults stand in.
  }
  return DEFAULT_FAVOURITES;
}

/** The five colours shown in every highlight toolbar, chosen on each device. */
export const useFavourites = create(() => ({ favourites: load() }));

/** Puts a colour in a favourite's place; one that is already a favourite swaps places with it, so none shows twice. */
export function setFavourite(slot: number, color: Color) {
  const now = [...useFavourites.getState().favourites];
  const was = now.indexOf(color);
  if (was >= 0) now[was] = now[slot]!;
  now[slot] = color;
  useFavourites.setState({ favourites: now });
  try {
    localStorage.setItem(KEY, JSON.stringify(now));
  } catch {
    // Kept for this visit only.
  }
}

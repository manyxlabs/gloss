import { Check, Palette, Star } from 'lucide-react';
import { useState } from 'react';
import { m } from '../i18n';
import { hueOf } from '../palette';
import { setFavourite, useFavourites } from '../store/favourites';
import { COLORS, type Color } from '../types';

const nameOf = (c: Color) => {
  const hue = m.canvasColours.hues[hueOf(c)];
  return c.startsWith('deep-') ? m.canvasColours.deep(hue) : hue;
};

/** Every colour, in rows of eight: the light shades, then the deep ones. */
export function PaletteGrid({ current, label, onPick }: { current?: Color; label: (name: string) => string; onPick: (c: Color) => void }) {
  return (
    <div className="palette-grid">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch hl-${c}${c === current ? ' current' : ''}`}
          aria-label={label(nameOf(c))}
          aria-pressed={c === current}
          title={nameOf(c)}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

/**
 * The favourite colours, then More, which opens all 32 and is tinted with the colour in use when
 * that is not a favourite. Favourites are edited in the palette: pick a place, then the colour to
 * put there.
 */
export function ColorPicker({ current, label, onPick }: { current?: Color; label: (name: string) => string; onPick: (c: Color) => void }) {
  const favourites = useFavourites((s) => s.favourites);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const other = current && !favourites.includes(current) ? current : null;
  const swatch = (c: Color) => (
    <button key={c} type="button" className={`swatch hl-${c}${c === current ? ' current' : ''}`} aria-label={label(nameOf(c))} title={label(nameOf(c))} onClick={() => onPick(c)} />
  );
  return (
    <>
      {favourites.map(swatch)}
      <button
        type="button"
        className={`icon more-colors${other ? ` hl-${other} other` : ''}`}
        aria-label={m.canvasColours.more}
        title={other ? m.canvasColours.moreNow(nameOf(other)) : m.canvasColours.more}
        aria-expanded={open}
        onClick={() => (setOpen(!open), setEditing(null))}
      >
        <Palette size={16} />
      </button>
      {open && (
        <div className="palette glass" role="dialog" aria-label={m.canvasColours.all}>
          {editing === null ? (
            <PaletteGrid current={current} label={label} onPick={(c) => (setOpen(false), onPick(c))} />
          ) : (
            <>
              <p className="palette-hint">{m.canvasColours.editHint}</p>
              <div className="palette-favourites" role="group" aria-label={m.canvasColours.favourites}>
                {favourites.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch hl-${c}${i === editing ? ' current' : ''}`}
                    aria-label={m.canvasColours.favourite(i + 1, nameOf(c))}
                    aria-pressed={i === editing}
                    onClick={() => setEditing(i)}
                  />
                ))}
              </div>
              <PaletteGrid current={favourites[editing]} label={(name) => m.canvasColours.makeFavourite(editing + 1, name)} onPick={(c) => setFavourite(editing, c)} />
            </>
          )}
          <footer>
            <button type="button" className="ghost" aria-pressed={editing !== null} onClick={() => setEditing(editing === null ? 0 : null)}>
              {editing === null ? <Star size={14} /> : <Check size={14} />} {editing === null ? m.canvasColours.editFavourites : m.canvasColours.done}
            </button>
          </footer>
        </div>
      )}
    </>
  );
}

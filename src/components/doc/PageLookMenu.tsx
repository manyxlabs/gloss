import { Coffee, Image, Moon, Sun, SunMoon } from 'lucide-react';
import { useState } from 'react';
import { PAGE_LOOKS, setKeepImages, setPageLook, useReading, type PageLook } from '../../reading';
import { Menu } from '../Menu';
import { m } from '../../i18n';

const LOOKS: Record<PageLook, [string, typeof Sun]> = {
  light: [m.docMenu.looks.light, Sun],
  dark: [m.docMenu.looks.dark, Moon],
  sepia: [m.docMenu.looks.sepia, Coffee],
  theme: [m.docMenu.looks.theme, SunMoon],
};

/** The page colours to choose from, as menu items; `close` is called once one is chosen. */
export function PageLookItems({ close }: { close: () => void }) {
  const reading = useReading();
  return (
    <>
      {PAGE_LOOKS.map((look) => {
        const [label, Icon] = LOOKS[look];
        return (
          <button key={look} role="menuitemradio" aria-checked={reading.look === look} onClick={() => (setPageLook(look), close())}>
            <Icon size={16} /> {label}
          </button>
        );
      })}
      <hr />
      {/* Stays open, as one may want to see the page each way. */}
      <button role="menuitemcheckbox" aria-checked={reading.keepImages} onClick={() => setKeepImages(!reading.keepImages)} title={m.docMenu.keepImagesTitle}>
        <Image size={16} /> {m.docMenu.keepImages}
      </button>
    </>
  );
}

/** Chooses how pages are shown on this device: light, dark, sepia, or following the app's theme. */
export function PageLookMenu() {
  const reading = useReading();
  const [button, setButton] = useState<HTMLElement | null>(null);
  const Shown = LOOKS[reading.look][1];
  return (
    <>
      <button
        className="icon overflow"
        aria-label={m.docMenu.pageColours}
        title={m.docMenu.pageColours}
        aria-haspopup="menu"
        aria-expanded={!!button}
        onClick={(e) => setButton(button ? null : e.currentTarget)}
      >
        <Shown size={17} />
      </button>
      {button && (
        <Menu anchor={button} label={m.docMenu.pageColours} onClose={() => setButton(null)}>
          <PageLookItems close={() => setButton(null)} />
        </Menu>
      )}
    </>
  );
}

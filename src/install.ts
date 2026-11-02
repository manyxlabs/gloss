import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** The browser's offer to install Gloss as an app, while there is one; null once installed or where installing is not offered. */
export function useInstall() {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onOffer = (e: Event) => {
      // Kept for our own button instead of the browser's mini bar.
      e.preventDefault();
      setOffer(e as InstallEvent);
    };
    const onInstalled = () => setOffer(null);
    addEventListener('beforeinstallprompt', onOffer);
    addEventListener('appinstalled', onInstalled);
    return () => {
      removeEventListener('beforeinstallprompt', onOffer);
      removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return offer
    ? async () => {
        await offer.prompt();
        if ((await offer.userChoice).outcome === 'accepted') setOffer(null);
      }
    : null;
}

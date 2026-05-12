import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Captures the browser's beforeinstallprompt event (Chrome/Edge/Android).
 * Returns a `promote()` function that fires the OS install dialog when
 * available, and `available` to gate the UI button. iOS Safari doesn't
 * fire this event — users install via the share-sheet "Add to Home Screen"
 * action instead, automatic once the manifest is valid. */
export function useInstallPrompt(): { available: boolean; promote: () => Promise<boolean> } {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    }
    function installed() { setEvent(null); }
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  async function promote(): Promise<boolean> {
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    setEvent(null);
    return choice.outcome === 'accepted';
  }
  return { available: event !== null, promote };
}

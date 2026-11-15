import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * While `active`, asks the phone to block screenshots and screen recording (Android: FLAG_SECURE; iOS: hides the content from capture where the system allows).
 * Returns whether blocking is in force. The browser build cannot block capture and reports false. Failure to block is not an error: the screen still warns.
 */
export function useScreenCaptureBlocked(active: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    let release: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const sc = await import('expo-screen-capture');
        const tag = 'dh-recovery-key';
        await sc.preventScreenCaptureAsync(tag);
        if (cancelled) await sc.allowScreenCaptureAsync(tag);
        else {
          setOn(true);
          release = () => void sc.allowScreenCaptureAsync(tag);
        }
      } catch {
        /* unsupported: the on-screen warning remains */
      }
    })();
    return () => {
      cancelled = true;
      release?.();
      setOn(false);
    };
  }, [active]);
  return on;
}

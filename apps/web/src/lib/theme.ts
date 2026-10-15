'use client';

import { useCallback, useEffect, useState } from 'react';

/** The person's choice; "system" follows the device setting. Kept in this browser only. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'op.theme';

/**
 * Runs before the first paint (inline script in the root layout, with the CSP nonce) so the page
 * never flashes the wrong theme. Keep it tiny and dependency-free.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');var d=c==='dark'||((!c||c==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;

function apply(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Current choice plus a setter that saves it and applies it at once. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    setChoice(readChoice());
    // Follow the device while the choice is "system".
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readChoice() === 'system') apply('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const update = useCallback((next: ThemeChoice) => {
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: still apply for this page view.
    }
    apply(next);
    setChoice(next);
  }, []);

  return [choice, update];
}

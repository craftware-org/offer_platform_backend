'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeChoice } from '@/lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Device', Icon: Monitor },
];

/** Light / Dark / follow the device: real radio buttons styled as a segmented control. */
export function ThemeSwitch() {
  const [choice, setChoice] = useTheme();
  return (
    <fieldset className="flex rounded-xl bg-gray-100 p-1">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, Icon }) => (
        <label
          key={value}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
            choice === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={choice === value}
            onChange={() => setChoice(value)}
            className="sr-only"
          />
          <Icon className="size-3.5" aria-hidden />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

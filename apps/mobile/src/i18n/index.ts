import { en, type StringKey } from './en';

const catalogs = { en } as const;
type Locale = keyof typeof catalogs;
let current: Locale = 'en';

export function setLocale(locale: string): void {
  current = (locale in catalogs ? locale : 'en') as Locale;
}

/** Looks up a string and fills `{name}` placeholders. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const raw: string = catalogs[current][key] ?? en[key];
  return params ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : raw;
}
export type { StringKey };

import { en, type StringKey } from './en';

const catalogs = { en } as const;
type Locale = keyof typeof catalogs;
let current: Locale = 'en';

export function setLocale(locale: string): void {
  current = (locale in catalogs ? locale : 'en') as Locale;
}
export function t(key: StringKey): string {
  return catalogs[current][key] ?? en[key];
}
export type { StringKey };

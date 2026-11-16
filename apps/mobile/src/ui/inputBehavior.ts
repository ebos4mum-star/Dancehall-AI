import type { KeyboardTypeOptions, ReturnKeyTypeOptions } from 'react-native';

/**
 * The keyboard and text behaviour of a field, decided in one place so every form is consistent. A screen never has to remember the right combination of
 * keyboard type, capitalisation, autocorrect and return key: it names the kind of field (or gives the few props it needs) and everything else follows native
 * conventions. Anything a screen passes explicitly always wins.
 *
 *  - Names, usernames, codes, e-mail and numbers are never autocorrected (a corrected name or food is a wrong record).
 *  - Numeric keyboards have no return key on iOS, so such fields only dismiss; text fields say "next" while another field follows and "done" on the last.
 *  - Multiline fields keep Return for a new line; a field that submits (search, send) shows the matching key.
 */
export type FieldKind =
  'text' | 'name' | 'username' | 'email' | 'search' | 'number' | 'decimal' | 'note' | 'code';

const NUMERIC: ReadonlySet<string> = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad']);
export const isNumericKeyboard = (k: KeyboardTypeOptions | undefined): boolean =>
  !!k && NUMERIC.has(k);

/** Keyboards that are never for prose: digits and symbols, links, email. Autocapitalise and autocorrect would only corrupt what is typed (a date of birth, a URL). */
const NOT_PROSE: ReadonlySet<string> = new Set([
  ...NUMERIC,
  'numbers-and-punctuation',
  'url',
  'email-address',
  'visible-password',
]);
export const isProseKeyboard = (k: KeyboardTypeOptions | undefined): boolean =>
  !k || !NOT_PROSE.has(k);

export interface InputBehaviorIn {
  kind?: FieldKind;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  /** Another single-line field follows this one in the form. */
  hasNext: boolean;
  /** The field does something on submit that is not "go to the next field" (search, send). */
  submits?: boolean;
}
export interface InputBehaviorOut {
  keyboardType: KeyboardTypeOptions;
  autoCapitalize: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect: boolean;
  spellCheck: boolean;
  returnKeyType: ReturnKeyTypeOptions;
  /** Single-line fields close the keyboard on the last field; multiline fields never do. */
  submitBehavior: 'submit' | 'blurAndSubmit' | 'newline';
}

export function inputBehavior(i: InputBehaviorIn): InputBehaviorOut {
  const kind: FieldKind =
    i.kind ??
    (i.multiline
      ? 'note'
      : i.secureTextEntry
        ? 'code'
        : isNumericKeyboard(i.keyboardType)
          ? 'number'
          : i.keyboardType === 'email-address'
            ? 'email'
            : 'text');
  const numeric = kind === 'number' || kind === 'decimal' || isNumericKeyboard(i.keyboardType);
  const keyboardType: KeyboardTypeOptions =
    i.keyboardType ??
    (kind === 'number'
      ? 'number-pad'
      : kind === 'decimal'
        ? 'decimal-pad'
        : kind === 'email'
          ? 'email-address'
          : 'default');
  const never =
    numeric ||
    kind === 'username' ||
    kind === 'email' ||
    kind === 'code' ||
    kind === 'name' ||
    kind === 'search' ||
    !isProseKeyboard(i.keyboardType) ||
    !!i.secureTextEntry;
  const autoCapitalize =
    i.autoCapitalize ?? (kind === 'name' ? 'words' : never ? 'none' : 'sentences');
  const autoCorrect = i.autoCorrect ?? !never;
  const multiline = !!i.multiline || kind === 'note';
  const returnKeyType: ReturnKeyTypeOptions =
    i.returnKeyType ??
    (multiline
      ? 'default'
      : kind === 'search'
        ? 'search'
        : i.submits
          ? 'done'
          : i.hasNext && !numeric
            ? 'next'
            : 'done');
  return {
    keyboardType,
    autoCapitalize,
    autoCorrect,
    spellCheck: autoCorrect,
    returnKeyType,
    submitBehavior: multiline ? 'newline' : i.hasNext || i.submits ? 'submit' : 'blurAndSubmit',
  };
}

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputBehavior } from './inputBehavior';
import { nextFieldId } from './formFocus';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const b = (o: Partial<Parameters<typeof inputBehavior>[0]> = {}) =>
  inputBehavior({ hasNext: false, ...o });

describe('keyboard and text behaviour by kind of field', () => {
  it('a plain text field capitalises sentences, autocorrects, says "next" while another field follows and "done" on the last', () => {
    expect(b({ hasNext: true })).toMatchObject({
      keyboardType: 'default',
      autoCapitalize: 'sentences',
      autoCorrect: true,
      returnKeyType: 'next',
      submitBehavior: 'submit',
    });
    expect(b()).toMatchObject({ returnKeyType: 'done', submitBehavior: 'blurAndSubmit' });
  });
  it('names are capitalised by word and never autocorrected', () => {
    expect(b({ kind: 'name' })).toMatchObject({
      autoCapitalize: 'words',
      autoCorrect: false,
      spellCheck: false,
    });
  });
  it('usernames, codes, e-mail and passwords are never capitalised or autocorrected', () => {
    for (const o of [
      { kind: 'username' as const },
      { kind: 'code' as const },
      { kind: 'email' as const },
      { secureTextEntry: true },
    ])
      expect(b(o), JSON.stringify(o)).toMatchObject({ autoCapitalize: 'none', autoCorrect: false });
    expect(b({ kind: 'email' }).keyboardType).toBe('email-address');
  });
  it('search fields show the Search key and do not autocorrect a food or a name', () => {
    expect(b({ kind: 'search' })).toMatchObject({
      returnKeyType: 'search',
      autoCorrect: false,
      autoCapitalize: 'none',
    });
  });
  it('numeric keyboards never autocorrect or capitalise and only offer Done (iOS has no Return key there)', () => {
    for (const keyboardType of ['number-pad', 'decimal-pad', 'numeric', 'phone-pad'] as const)
      expect(b({ keyboardType, hasNext: true }), keyboardType).toMatchObject({
        autoCorrect: false,
        autoCapitalize: 'none',
        returnKeyType: 'done',
      });
    expect(b({ kind: 'decimal' }).keyboardType).toBe('decimal-pad');
    expect(b({ kind: 'number' }).keyboardType).toBe('number-pad');
  });
  it('multiline notes keep Return for a new line and never close the keyboard on Return', () => {
    expect(b({ multiline: true })).toMatchObject({
      returnKeyType: 'default',
      submitBehavior: 'newline',
      autoCapitalize: 'sentences',
      autoCorrect: true,
    });
    expect(b({ kind: 'note', hasNext: true }).submitBehavior).toBe('newline');
  });
  it('a field that submits (send, add) says so, and what the screen sets always wins', () => {
    expect(b({ submits: true, hasNext: true }).returnKeyType).toBe('done');
    expect(b({ returnKeyType: 'send', submits: true }).returnKeyType).toBe('send');
    expect(b({ kind: 'name', autoCapitalize: 'none', autoCorrect: true })).toMatchObject({
      autoCapitalize: 'none',
      autoCorrect: true,
    });
    expect(b({ keyboardType: 'email-address' }).autoCapitalize).toBe('none');
  });
});

describe('Return moves through the form in order and the last field ends it', () => {
  it('picks the next field, and none after the last or for an unknown field', () => {
    expect(nextFieldId(['a', 'b', 'c'], 'a')).toBe('b');
    expect(nextFieldId(['a', 'b', 'c'], 'b')).toBe('c');
    expect(nextFieldId(['a', 'b', 'c'], 'c')).toBeNull();
    expect(nextFieldId(['a'], 'a')).toBeNull();
    expect(nextFieldId(['a', 'b'], 'zzz')).toBeNull();
  });
});

describe('symbol keyboards never get prose behaviour', () => {
  it('a date-of-birth style field (numbers-and-punctuation) is never capitalised or autocorrected, and still offers Next', () => {
    const b = inputBehavior({ keyboardType: 'numbers-and-punctuation', hasNext: true });
    expect(b.autoCapitalize).toBe('none');
    expect(b.autoCorrect).toBe(false);
    expect(b.returnKeyType).toBe('next');
    expect(inputBehavior({ keyboardType: 'url', hasNext: false }).autoCorrect).toBe(false);
  });
});

describe('every input in the app goes through the shared behaviour (static audit)', () => {
  it('the only raw TextInputs are the two wrappers and the Coach message box', () => {
    const files = execSync("grep -rlE '<TextInput( |$)' app src --include=*.tsx", {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter((f) => !f.includes('.test.'))
      .sort();
    expect(files).toEqual([
      'app/(tabs)/coach.tsx',
      'src/onboarding/kit.tsx',
      'src/ui/TextField.tsx',
    ]);
  });
  it('both wrappers use the form hook', () => {
    expect(read('src/ui/TextField.tsx')).toMatch(/useFormField\(/);
    expect(read('src/onboarding/kit.tsx')).toMatch(/useFormField\(/);
  });
  it('Screen is a form: focus chain, scroll-to-field, interactive keyboard dismissal, keyboard avoidance', () => {
    const s = read('src/ui/Screen.tsx');
    expect(s).toMatch(/FormFocusProvider/);
    expect(s).toMatch(/keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive'/);
    expect(s).toMatch(/KeyboardAvoidingView/);
    expect(s).toMatch(/keyboardShouldPersistTaps="handled"/);
    expect(s).toMatch(/scrollTo\(/);
  });
  it('the Coach box is multiline with Return = send, grows to a limit, and has a send key', () => {
    const c = read('app/(tabs)/coach.tsx');
    expect(c).toMatch(/multiline/);
    expect(c).toMatch(/submitBehavior="submit"/);
    expect(c).toMatch(/returnKeyType="send"/);
    expect(c).toMatch(/maxHeight: 120/);
  });
  it('name, username and search fields declare their kind', () => {
    const must: Array<[string, RegExp]> = [
      ['app/onboarding.tsx', /kind="name"/],
      ['app/friends.tsx', /kind="username"/],
      ['app/privacy.tsx', /kind="name"/],
      ['app/food/add.tsx', /kind="search"/],
      ['app/food/fridge.tsx', /kind="search"/],
      ['src/community/UsernameClaim.tsx', /kind="username"/],
    ];
    for (const [f, re] of must) expect(read(f), f).toMatch(re);
  });
});

describe('press feedback is shared, not copied', () => {
  it('selectable cards use Tappable', () => {
    const kit = readFileSync(join(__dirname, 'kit.tsx'), 'utf8');
    const onb = readFileSync(join(__dirname, '../onboarding/kit.tsx'), 'utf8');
    expect(kit).toMatch(/export function IconChoice[\s\S]*<Tappable/);
    expect(onb).toMatch(/export function YesNoCard[\s\S]*<Tappable/);
  });
});

describe('household fields submit their own action', () => {
  it('the join code is a code field and Return submits create/join instead of moving to an unrelated field', () => {
    const src = read('app/food/household.tsx');
    expect(src).toMatch(/kind="code"/);
    expect(src).toMatch(/onSubmitEditing=\{\(\) => void run\(\(\) => store\.joinHousehold/);
    expect(src).toMatch(/onSubmitEditing=\{\(\) => void run\(\(\) => store\.createHousehold/);
  });
});

import {
  createContext,
  type ElementRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { TextInput, TextInputProps } from 'react-native';
import { inputBehavior, type FieldKind } from './inputBehavior';

/** The fields of one form in the order they appear, so Return moves to the next field and the last one closes the keyboard. Pure, tested. */
export const nextFieldId = (order: readonly string[], id: string): string | null => {
  const i = order.indexOf(id);
  return i >= 0 && i < order.length - 1 ? order[i + 1]! : null;
};

export type InputRef = ElementRef<typeof TextInput>;
interface Field {
  id: string;
  ref: RefObject<InputRef | null>;
}
interface Ctx {
  fields: Field[];
  register(f: Field): () => void;
  /** Called when a field gains focus, so the screen can scroll it clear of the keyboard. */
  focused(ref: RefObject<InputRef | null>): void;
}
const FormCtx = createContext<Ctx | null>(null);

/** Provided by `Screen`. Fields register in the order they mount, which is the order they are drawn. */
export function FormFocusProvider({
  children,
  onFieldFocus,
}: {
  children: ReactNode;
  onFieldFocus?: (ref: RefObject<InputRef | null>) => void;
}) {
  const [fields, setFields] = useState<Field[]>([]);
  const register = useCallback((f: Field) => {
    setFields((cur) => [...cur.filter((x) => x.id !== f.id), f]);
    return () => setFields((cur) => cur.filter((x) => x.id !== f.id));
  }, []);
  const value = useMemo<Ctx>(
    () => ({ fields, register, focused: (r) => onFieldFocus?.(r) }),
    [fields, register, onFieldFocus],
  );
  return <FormCtx.Provider value={value}>{children}</FormCtx.Provider>;
}

export interface FormFieldOptions {
  kind?: FieldKind;
  /** Props the screen passed; they always win over the defaults. */
  props: Pick<
    TextInputProps,
    | 'keyboardType'
    | 'multiline'
    | 'secureTextEntry'
    | 'autoCapitalize'
    | 'autoCorrect'
    | 'returnKeyType'
    | 'onSubmitEditing'
    | 'onFocus'
    | 'submitBehavior'
  >;
  /** The field does something on submit other than moving on (search, send). */
  submits?: boolean;
}

/** Props to spread into a TextInput: correct keyboard, capitalisation, autocorrect and return key; Next moves focus, Done closes the keyboard; the field is scrolled into view. */
export function useFormField({ kind, props, submits }: FormFieldOptions) {
  const ctx = useContext(FormCtx);
  const ref = useRef<InputRef | null>(null);
  const id = useId();
  const multiline = !!props.multiline;
  const joins = !!ctx && !multiline; // multiline fields keep Return for a new line
  useEffect(() => {
    if (!ctx || !joins) return;
    return ctx.register({ id, ref });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once per mount
  }, [id, joins, ctx?.register]);
  const order = ctx?.fields.map((f) => f.id) ?? [];
  const hasNext = joins && nextFieldId(order, id) !== null;
  const b = inputBehavior({
    kind,
    keyboardType: props.keyboardType,
    multiline,
    secureTextEntry: props.secureTextEntry,
    autoCapitalize: props.autoCapitalize,
    autoCorrect: props.autoCorrect,
    returnKeyType: props.returnKeyType,
    hasNext,
    submits: submits || !!props.onSubmitEditing,
  });
  return {
    ref,
    keyboardType: b.keyboardType,
    autoCapitalize: b.autoCapitalize,
    autoCorrect: b.autoCorrect,
    spellCheck: b.spellCheck,
    returnKeyType: b.returnKeyType,
    submitBehavior: props.submitBehavior ?? b.submitBehavior,
    onFocus: (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
      props.onFocus?.(e);
      ctx?.focused(ref);
    },
    onSubmitEditing: (e: Parameters<NonNullable<TextInputProps['onSubmitEditing']>>[0]) => {
      props.onSubmitEditing?.(e);
      if (props.onSubmitEditing || multiline) return; // the screen decided what submit means
      const next = ctx ? nextFieldId(order, id) : null;
      if (next) ctx?.fields.find((f) => f.id === next)?.ref.current?.focus();
    },
  };
}

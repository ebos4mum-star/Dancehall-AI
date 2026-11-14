import {
  createContext,
  createElement,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { defaultMealType, type FoodItemValues, type MealType } from '@dancehall/shared';
import type { FoodLogSource } from '@/data/types';

export interface DraftItem extends FoodItemValues {
  key: string;
  /** Recognition could not match this item to reference data: the person must choose a food (or remove it). */
  needsMatch?: boolean;
  likelyIngredients?: string[];
}
export interface Draft {
  items: DraftItem[];
  mealType: MealType;
  source: FoodLogSource;
  photoAnalysisId: string | null;
  provider: 'mock' | 'live' | null;
  notes: string | null;
}
export type DraftAction =
  | { type: 'start'; draft: Partial<Draft> & { items?: DraftItem[] } }
  | { type: 'add'; item: FoodItemValues }
  | { type: 'update'; key: string; item: FoodItemValues }
  | { type: 'remove'; key: string }
  | { type: 'mealType'; mealType: MealType }
  | { type: 'clear' };

let n = 0;
export const newKey = () => `d${Date.now().toString(36)}${(n++).toString(36)}`;
export const emptyDraft = (now: Date = new Date()): Draft => ({
  items: [],
  mealType: defaultMealType(now),
  source: 'manual',
  photoAnalysisId: null,
  provider: null,
  notes: null,
});

export function draftReducer(state: Draft, a: DraftAction): Draft {
  switch (a.type) {
    case 'start':
      return {
        ...emptyDraft(),
        ...a.draft,
        items: (a.draft.items ?? []).map((i) => ({ ...i, key: i.key ?? newKey() })),
      };
    case 'add':
      return { ...state, items: [...state.items, { ...a.item, key: newKey() }] };
    case 'update':
      return {
        ...state,
        items: state.items.map((i) => (i.key === a.key ? { ...a.item, key: a.key } : i)),
      };
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.key !== a.key) };
    case 'mealType':
      return { ...state, mealType: a.mealType };
    case 'clear':
      return emptyDraft();
  }
}

/** The plain values that are stored (UI-only fields removed). */
export function toValues(i: DraftItem): FoodItemValues {
  const { key: _key, needsMatch: _needsMatch, likelyIngredients: _likely, ...values } = i;
  return values;
}

/** Items that still block saving: unresolved matches. */
export const unresolved = (d: Draft): DraftItem[] => d.items.filter((i) => i.needsMatch);

const Ctx = createContext<{ draft: Draft; dispatch: Dispatch<DraftAction> } | null>(null);
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, dispatch] = useReducer(draftReducer, undefined, () => emptyDraft());
  return createElement(Ctx.Provider, { value: { draft, dispatch } }, children);
}
export function useDraft() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDraft must be used inside DraftProvider');
  return v;
}

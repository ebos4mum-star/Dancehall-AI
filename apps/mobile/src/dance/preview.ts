import { t } from '@/i18n';

/** Content that exists only in development and review builds: an internal fixture (placeholder) or an unreviewed draft. Both are always labelled. */
export type PreviewFlags = { fixture?: boolean | true; draft?: unknown };
export const previewTag = (x: PreviewFlags): string | null =>
  x.fixture ? t('wk.fixtureTag') : x.draft ? t('wk.draftTag') : null;
export const previewBanner = (x: PreviewFlags): string | null =>
  x.fixture ? t('wk.fixtureBanner') : x.draft ? t('wk.draftBanner') : null;

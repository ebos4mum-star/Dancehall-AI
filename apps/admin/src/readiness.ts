import { WORKOUTS, licenceAllows, publishReadiness, type Licence } from '@dancehall/shared';

/** Publication checklist for every sample workout. No reviews, media or licences are connected, so this shows what each one still needs. */
export function sampleReadiness() {
  return WORKOUTS.map((w) => ({
    id: w.id,
    title: w.title,
    style: w.style,
    minutes: w.minutes,
    check: publishReadiness({
      isSynthetic: true,
      createdBy: null,
      blocks: w.blocks,
      safety: w.safety,
      reviews: [],
      media: [],
      licences: [],
      today: '2026-06-01',
    }),
  }));
}

/** An ILLUSTRATIVE licence (not a real record) evaluated against example countries, to show how territorial clearance works. */
export const EXAMPLE_LICENCE: Licence = {
  id: 'example',
  assetKind: 'music',
  title: 'Example track licence (illustrative)',
  status: 'cleared',
  territories: ['GH', 'NG', 'GB'],
  startsOn: '2026-01-01',
  endsOn: '2026-12-31',
  evidenceRef: 'EXAMPLE-ONLY',
};
export function exampleTerritoryTable() {
  const rows = [
    { country: 'GH', today: '2026-06-01' },
    { country: 'US', today: '2026-06-01' },
    { country: 'GB', today: '2027-01-01' },
    { country: 'NG', today: '2025-12-31' },
  ];
  return rows.map((r) => ({ ...r, allowed: licenceAllows(EXAMPLE_LICENCE, r.country, r.today) }));
}

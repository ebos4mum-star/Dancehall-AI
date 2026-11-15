import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DB_STYLES,
  DB_STYLES_V2,
  buildSeedSql,
  foodSeedProblems,
  seedProblems,
  workoutSeedProblems,
} from './seed-lib.mjs';

const data = JSON.parse(readFileSync('packages/shared/src/food-data.json', 'utf8'));
const wk = JSON.parse(readFileSync('packages/shared/src/workout-data.json', 'utf8'));
const staged = JSON.parse(readFileSync('packages/shared/src/food-staged.json', 'utf8'));

const review = {
  status: 'approved',
  reviewerRole: 'exercise_physiologist',
  evidenceRef: 'rev-1',
  reviewedOn: '2026-06-01',
  isAuthor: false,
};
const base = wk.workouts[0];
const reviewedWorkout = (over = {}) => ({
  ...base,
  id: 'dh-reviewed-test',
  style: 'dancehall',
  tempoBpm: [90, 100],
  provenance: { credits: ['A. Author'], rightsRef: 'rights-1', review, culturalReviewRef: 'cul-1' },
  ...over,
});
const food = data.foods[0];
const reviewedFood = (over = {}) => ({
  ...food,
  id: 'yam-reviewed-test',
  regionTags: ['jamaican'],
  provenance: {
    sourceId: 'usda_fdc',
    sourceFoodId: 'FDC 170072',
    sourceVersion: 'SR Legacy',
    retrievedOn: '2026-11-15',
    attribution: 'USDA FoodData Central',
    licenceRef: 'lic-1',
    reviewRef: 'diet-1',
    culturalReviewRef: 'cul-1',
  },
  ...over,
});

test('the shipped data passes, and the seed it makes is the committed seed', () => {
  assert.deepEqual(seedProblems({ foods: data.foods, workouts: wk.workouts }), []);
  assert.equal(buildSeedSql(data, wk), readFileSync('supabase/seed.sql', 'utf8'));
});

test('every staged (source-only, unreviewed) food is refused', () => {
  assert.ok(staged.foods.length > 30);
  for (const f of staged.foods)
    assert.match(foodSeedProblems(f).join(' '), /staged, unreviewed food/, f.id);
  assert.throws(
    () => buildSeedSql({ ...data, foods: [...data.foods, staged.foods[0]] }, wk),
    /staged, unreviewed food/,
  );
});

test('fixtures and unreviewed drafts are refused, whatever their style', () => {
  for (const style of DB_STYLES_V2) {
    assert.match(
      workoutSeedProblems({ ...base, style, fixture: true }, DB_STYLES_V2).join(' '),
      /internal fixture/,
    );
    assert.match(
      workoutSeedProblems(
        { ...base, style, draft: { pack: 'x', needs: ['x'] } },
        DB_STYLES_V2,
      ).join(' '),
      /unreviewed draft/,
    );
  }
  assert.throws(
    () =>
      buildSeedSql(data, {
        ...wk,
        workouts: [...wk.workouts, { ...base, id: 'x', draft: { pack: 'x', needs: ['x'] } }],
      }),
    /unreviewed draft/,
  );
});

test('new styles are refused until the migration is approved, and protected styles need a complete independent review even after it', () => {
  for (const style of ['dancehall', 'reggae', 'chair_dance'])
    assert.match(
      workoutSeedProblems({ ...base, style }).join(' '),
      /cannot be stored until the style migration/,
    );
  assert.match(
    workoutSeedProblems({ ...base, style: 'reggae' }, DB_STYLES_V2).join(' '),
    /needs provenance/,
  );
  assert.deepEqual(workoutSeedProblems(reviewedWorkout(), DB_STYLES_V2), []);
  assert.match(workoutSeedProblems(reviewedWorkout()).join(' '), /style migration/); // default flag off
  const cases = [
    [{ provenance: { ...reviewedWorkout().provenance, credits: [] } }, /no credited author/],
    [{ provenance: { ...reviewedWorkout().provenance, rightsRef: '' } }, /no rights reference/],
    [
      {
        provenance: { ...reviewedWorkout().provenance, review: { ...review, status: 'in_review' } },
      },
      /not approved/,
    ],
    [
      { provenance: { ...reviewedWorkout().provenance, review: { ...review, isAuthor: true } } },
      /independent/,
    ],
    [
      {
        provenance: {
          ...reviewedWorkout().provenance,
          review: { ...review, reviewerRole: 'dancer' },
        },
      },
      /exercise professional/,
    ],
    [
      { provenance: { ...reviewedWorkout().provenance, review: { ...review, evidenceRef: '' } } },
      /incomplete/,
    ],
    [{ provenance: { ...reviewedWorkout().provenance, culturalReviewRef: '' } }, /cultural review/],
    [{ tempoBpm: undefined }, /tempo/],
  ];
  for (const [over, re] of cases)
    assert.match(
      workoutSeedProblems(reviewedWorkout(over), DB_STYLES_V2).join(' '),
      re,
      JSON.stringify(over),
    );
  // Chair dance needs no cultural review, but everything else.
  assert.deepEqual(
    workoutSeedProblems(
      reviewedWorkout({
        style: 'chair_dance',
        provenance: { credits: ['A. Author'], rightsRef: 'r-1', review },
      }),
      DB_STYLES_V2,
    ),
    [],
  );
});

test('reviewed workouts are inserted as DRAFT and non-synthetic, so the database still decides publication', () => {
  const sql = buildSeedSql(
    data,
    { ...wk, workouts: [...wk.workouts, reviewedWorkout()] },
    DB_STYLES_V2,
  );
  assert.match(sql, /REVIEWED workouts: inserted as DRAFT and non-synthetic/);
  const stmt = sql.split('-- REVIEWED workouts')[1];
  assert.match(stmt, /'dh-reviewed-test'/);
  assert.match(stmt, /'draft', false\)/);
  assert.doesNotMatch(stmt, /'published'/);
});

test('reviewed foods carry their source and attribution; incomplete provenance is refused', () => {
  assert.deepEqual(foodSeedProblems(reviewedFood()), []);
  const sql = buildSeedSql({ ...data, foods: [...data.foods, reviewedFood()] }, wk);
  const stmt = sql.split('-- REVIEWED foods')[1];
  assert.match(stmt, /'yam-reviewed-test'/);
  assert.match(stmt, /'usda_fdc', false, 'USDA FoodData Central'\)/);
  for (const key of [
    'sourceFoodId',
    'sourceVersion',
    'attribution',
    'licenceRef',
    'reviewRef',
    'retrievedOn',
  ])
    assert.match(
      foodSeedProblems(
        reviewedFood({ provenance: { ...reviewedFood().provenance, [key]: '' } }),
      ).join(' '),
      new RegExp(key),
      key,
    );
  assert.match(
    foodSeedProblems(
      reviewedFood({ provenance: { ...reviewedFood().provenance, culturalReviewRef: '' } }),
    ).join(' '),
    /cultural review/,
  );
  // A food outside the priority cuisines does not need the cultural record.
  assert.deepEqual(
    foodSeedProblems(
      reviewedFood({
        regionTags: ['global'],
        provenance: { ...reviewedFood().provenance, culturalReviewRef: undefined },
      }),
    ),
    [],
  );
});

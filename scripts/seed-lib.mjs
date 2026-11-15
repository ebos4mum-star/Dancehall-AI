// The hosted-seed rules, as pure functions, so they can be tested without touching a file or a database.
// Nothing unreviewed may be seeded: internal fixtures, unreviewed drafts, staged (source-only) foods, protected-style workouts without a complete independent review,
// and styles the database cannot store yet. `buildSeedSql` writes the same SQL as before for the synthetic sample data; reviewed content (which does not exist yet)
// is written as separate statements: reviewed foods carry their source and attribution, reviewed workouts are inserted as DRAFT and non-synthetic, so the database's
// own publishing rules (independent review, cleared licence) still decide what becomes visible.

export const DB_STYLES = ['afrobeats', 'amapiano', 'hip_hop', 'latin', 'bollywood', 'low_impact'];
/** The styles after the M3 v2 migration. Used only when the owner has approved and applied it (`--allow-new-styles`). */
export const DB_STYLES_V2 = [...DB_STYLES, 'dancehall', 'reggae', 'chair_dance'];
const PROTECTED = ['dancehall', 'reggae', 'chair_dance'];
const CULTURAL = ['dancehall', 'reggae'];
const FITNESS_ROLES = ['exercise_physiologist', 'certified_strength_coach', 'physiotherapist'];
const PRIORITY_TAGS = ['jamaican', 'caribbean', 'west_african', 'east_african', 'southern_african'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const filled = (s) => typeof s === 'string' && s.trim().length >= 3;

export function workoutSeedProblems(w, allowedStyles = DB_STYLES) {
  const out = [];
  if (w.fixture) out.push('an internal fixture must never be bundled or seeded');
  if (w.draft) out.push('an unreviewed draft must never be bundled or seeded');
  if (!allowedStyles.includes(w.style))
    out.push(`style ${w.style} cannot be stored until the style migration is approved and applied`);
  const p = w.provenance;
  if (PROTECTED.includes(w.style) || p) {
    if (!p)
      out.push(`${w.style} content needs provenance (credits, rights and an independent review)`);
    else {
      if (!Array.isArray(p.credits) || p.credits.length === 0 || p.credits.some((c) => !filled(c)))
        out.push('no credited author');
      if (!filled(p.rightsRef)) out.push('no rights reference');
      const r = p.review ?? {};
      if (r.status !== 'approved') out.push('fitness and safety review is not approved');
      if (!FITNESS_ROLES.includes(r.reviewerRole))
        out.push(
          'the reviewer must be an exercise professional, strength coach or physiotherapist',
        );
      if (!filled(r.evidenceRef) || !DATE.test(r.reviewedOn ?? ''))
        out.push('review record incomplete');
      if (r.isAuthor !== false) out.push('the reviewer must be independent of the author');
      if (CULTURAL.includes(w.style) && !filled(p.culturalReviewRef))
        out.push('Dancehall and reggae sessions need a cultural review reference');
      if (PROTECTED.includes(w.style) && !Array.isArray(w.tempoBpm))
        out.push('protected styles need a confirmed tempo range');
    }
  }
  return out;
}

export function foodSeedProblems(f) {
  const out = [];
  if (f.staged) out.push('a staged, unreviewed food must never be bundled or seeded');
  const p = f.provenance;
  if (p) {
    for (const k of ['sourceFoodId', 'sourceVersion', 'attribution', 'licenceRef', 'reviewRef'])
      if (!filled(p[k])) out.push(`provenance is missing ${k}`);
    if (!DATE.test(p.retrievedOn ?? '')) out.push('provenance is missing retrievedOn');
    if ((f.regionTags ?? []).some((t) => PRIORITY_TAGS.includes(t)) && !filled(p.culturalReviewRef))
      out.push('priority-cuisine foods need a cultural review record');
  }
  return out;
}

export function seedProblems({ foods, workouts }, allowedStyles = DB_STYLES) {
  const out = [];
  for (const f of foods) for (const m of foodSeedProblems(f)) out.push(`food ${f.id}: ${m}`);
  for (const w of workouts)
    for (const m of workoutSeedProblems(w, allowedStyles)) out.push(`workout ${w.id}: ${m}`);
  return out;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const jsonb = (v) => `${q(JSON.stringify(v))}::jsonb`;
const arr = (a) => `array[${a.map(q).join(', ')}]::text[]`;

export function buildSeedSql(data, wk, allowedStyles = DB_STYLES) {
  const problems = seedProblems({ foods: data.foods, workouts: wk.workouts }, allowedStyles);
  if (problems.length > 0)
    throw new Error(`Refusing to generate a seed:\n  ${problems.join('\n  ')}`);
  const synthFoods = data.foods.filter((f) => !f.provenance);
  const reviewedFoods = data.foods.filter((f) => f.provenance);
  const synthWorkouts = wk.workouts.filter((w) => !w.provenance);
  const reviewedWorkouts = wk.workouts.filter((w) => w.provenance);
  const foodRow = (f, extra = '') =>
    `(${q(f.id)}, ${q(f.name)}, ${q(f.category)}, ${arr(f.regionTags)}, ${f.per100g.kcal}, ${f.per100g.proteinG}, ${f.per100g.carbsG}, ${f.per100g.fatG}, ${f.per100g.fiberG ?? 0}, ${f.servingG}, ${q(f.servingLabel)}, ${f.costTier}, ${arr(f.aliases)}${extra})`;
  const workoutRow = (w, status, synthetic) =>
    `(${q(w.id)}, ${q(w.title)}, ${q(w.style)}, ${q(w.level)}, ${q(w.intensity)}, ${q(w.impact)}, ${w.minutes}, ${q(w.summary)}, ${w.instructorId ? q(w.instructorId) : 'null'}, ${q(w.equipment)}, ${q(w.contentOrigin)}, ${jsonb(w.blocks)}, ${jsonb(w.safety)}, ${q(status)}, ${synthetic})`;
  const instructorRows = wk.instructors.map(
    (i) => `(${q(i.id)}, ${q(i.displayName)}, ${q(i.bio)}, 'published', true)`,
  );
  const programRows = wk.programs.map(
    (p) =>
      `(${q(p.id)}, ${q(p.title)}, ${q(p.description)}, ${p.weeks}, ${p.sessionsPerWeek}, ${q(p.level)}, ${p.instructorId ? q(p.instructorId) : 'null'}, 'published', true)`,
  );
  const programWorkoutRows = wk.programs.flatMap((p) =>
    p.schedule.map((s) => `(${q(p.id)}, ${s.week}, ${s.day}, ${q(s.workoutId)})`),
  );
  const WORKOUT_COLS =
    'id, title, style, level, intensity, impact, minutes, summary, instructor_id, equipment, content_origin, blocks, safety, status, is_synthetic';
  let sql = `-- GENERATED by scripts/gen-seed.mjs from packages/shared/src/food-data.json and workout-data.json. Do not edit by hand.
-- ${data._notice}
-- ${wk._notice}
insert into public.instructors (id, display_name, bio, status, is_synthetic) values
${instructorRows.join(',\n')}
on conflict (id) do nothing;
insert into public.workouts (${WORKOUT_COLS}) values
${synthWorkouts.map((w) => workoutRow(w, 'published', true)).join(',\n')}
on conflict (id) do nothing;
insert into public.programs (id, title, description, weeks, sessions_per_week, level, instructor_id, status, is_synthetic) values
${programRows.join(',\n')}
on conflict (id) do nothing;
insert into public.program_workouts (program_id, week, day, workout_id) values
${programWorkoutRows.join(',\n')}
on conflict do nothing;
insert into public.foods (id, name, category, region_tags, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, serving_g, serving_label, cost_tier, aliases)
values
${synthFoods.map((f) => foodRow(f)).join(',\n')}
on conflict (id) do update set name = excluded.name, category = excluded.category, region_tags = excluded.region_tags, kcal_100g = excluded.kcal_100g,
  protein_100g = excluded.protein_100g, carbs_100g = excluded.carbs_100g, fat_100g = excluded.fat_100g, fiber_100g = excluded.fiber_100g,
  serving_g = excluded.serving_g, serving_label = excluded.serving_label, cost_tier = excluded.cost_tier, aliases = excluded.aliases;
`;
  if (reviewedWorkouts.length > 0)
    sql += `-- REVIEWED workouts: inserted as DRAFT and non-synthetic. The database's own rules (independent review, cleared likeness licence) still decide when they are published.
insert into public.workouts (${WORKOUT_COLS}) values
${reviewedWorkouts.map((w) => workoutRow(w, 'draft', false)).join(',\n')}
on conflict (id) do nothing;
`;
  if (reviewedFoods.length > 0)
    sql += `-- REVIEWED foods: carry their published source and attribution and are not synthetic.
insert into public.foods (id, name, category, region_tags, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, serving_g, serving_label, cost_tier, aliases, source, is_synthetic, attribution)
values
${reviewedFoods.map((f) => foodRow(f, `, ${q(f.provenance.sourceId === 'usda_fdc' ? 'usda_fdc' : 'curated')}, false, ${q(f.provenance.attribution)}`)).join(',\n')}
on conflict (id) do nothing;
`;
  return sql;
}

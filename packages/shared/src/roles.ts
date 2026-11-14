/** Staff roles and permissions for the admin portal. Enforced in the database (RLS/functions) in Phase 1+; this is the shared definition. */
export const STAFF_ROLES = [
  'admin',
  'content_editor',
  'licensing_manager',
  'moderator',
  'nutrition_reviewer',
  'fitness_reviewer',
  'support',
  'analyst',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  'content.edit',
  'content.publish',
  'licensing.manage',
  'moderation.review',
  'nutrition.review',
  'fitness.review',
  'support.lookup',
  'flags.manage',
  'ai_costs.view',
  'audit.view',
  'staff.manage',
  'analytics.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<StaffRole, readonly Permission[]>> = {
  admin: [...PERMISSIONS],
  content_editor: ['content.edit'],
  licensing_manager: ['licensing.manage', 'content.publish'],
  moderator: ['moderation.review'],
  nutrition_reviewer: ['nutrition.review', 'content.edit'],
  fitness_reviewer: ['fitness.review', 'content.edit'],
  support: ['support.lookup'],
  analyst: ['analytics.view', 'ai_costs.view'],
};

/**
 * Every staff permission requires a verified second factor (aal2). No role, including admin, bypasses it.
 * No permission grants read access to a person's private health records; support tools expose account and
 * subscription state only, and any health-data access path must be separate, justified and audited.
 */
export function hasPermission(
  role: StaffRole | null | undefined,
  permission: Permission,
  session: { mfaVerified: boolean },
): boolean {
  if (!role || !session.mfaVerified) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

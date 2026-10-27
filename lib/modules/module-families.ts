/**
 * The platform's module families.
 *
 * Every dynamic module carries a `module_type`. Four of those types are large
 * enough to deserve their own register in the admin panel and their own screen in
 * the auditor panel, and this file is the single place that says which types those
 * are and what each is called — so a rename never has to be hunted through pages.
 */

export interface ModuleFamily {
  /** The `module_type` that selects this family. */
  type: string;
  /** Plural label, for menus and headings. */
  label: string;
  /** Singular label, for one row. */
  singular: string;
  /** One line explaining what the family is for. */
  description: string;
}

export const MODULE_FAMILIES: Record<string, ModuleFamily> = {
  assessments: {
    type: 'ASSESSMENT',
    label: 'Assessments',
    singular: 'Assessment',
    description: 'Structured assessments filed against an establishment, scored and verified like an audit.',
  },
  risks: {
    type: 'RISK',
    label: 'Risk Registers',
    singular: 'Risk',
    description: 'Risk registers and their reviews, with the controls each hazard is held under.',
  },
  studies: {
    type: 'STUDY',
    label: 'Studies',
    singular: 'Study',
    description: 'Industrial studies and surveys, kept beside the audits they support.',
  },
  'work-permits': {
    type: 'WORK_PERMIT',
    label: 'Work Permits',
    singular: 'Work Permit',
    description: 'Permits to work for hot work, confined spaces, height and the rest of the high-risk jobs.',
  },
};

/** The family for a route slug (`/admin/risks` → the risk register). */
export function moduleFamily(slug: string): ModuleFamily | null {
  return MODULE_FAMILIES[slug] ?? null;
}

/** The family for a stored `module_type`, if it is one of the named families. */
export function moduleFamilyByType(type: string | null | undefined): ModuleFamily | null {
  if (!type) return null;
  const upper = String(type).toUpperCase();
  return Object.values(MODULE_FAMILIES).find((family) => family.type === upper) ?? null;
}

/** Every family, in menu order. */
export function moduleFamilyList(): ModuleFamily[] {
  return Object.values(MODULE_FAMILIES);
}

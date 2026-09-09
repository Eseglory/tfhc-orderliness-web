/**
 * RBAC permission catalogue.
 *
 * Permissions are a fixed, code-defined vocabulary. Roles (system + custom) are
 * stored in the database and hold a subset of these strings. Super Admin holds
 * the wildcard `*` and is never restricted.
 *
 * Guard semantics: a handler decorated with `@RequirePermissions('a', 'b')`
 * requires the caller to hold BOTH `a` AND `b` (or `*`).
 */

export const PERMISSION_WILDCARD = '*' as const;

export interface PermissionDef {
  key: string;
  group: string;
  label: string;
  /** True when the permission governs money/finance data. Used to keep the
   *  default Administration role out of finance and vice versa. */
  finance?: boolean;
}

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  // Members
  { key: 'members.read', group: 'Members', label: 'View members' },
  { key: 'members.create', group: 'Members', label: 'Add members' },
  { key: 'members.update', group: 'Members', label: 'Edit members' },
  { key: 'members.deactivate', group: 'Members', label: 'Deactivate / reactivate members' },
  { key: 'members.delete', group: 'Members', label: 'Delete members' },

  // Events (general event system; supersedes bare "meetings")
  { key: 'events.read', group: 'Events', label: 'View events' },
  { key: 'events.create', group: 'Events', label: 'Create events' },
  { key: 'events.update', group: 'Events', label: 'Edit events' },
  { key: 'events.delete', group: 'Events', label: 'Delete events' },
  { key: 'events.cancel', group: 'Events', label: 'Cancel events / occurrences' },
  { key: 'events.manage_types', group: 'Events', label: 'Manage event types' },

  // Attendance
  { key: 'attendance.read', group: 'Attendance', label: 'View attendance' },
  { key: 'attendance.manage', group: 'Attendance', label: 'Record / amend attendance' },

  // Scoring & leaderboard
  { key: 'scoring.read', group: 'Scoring', label: 'View scoring & leaderboard' },
  { key: 'scoring.configure', group: 'Scoring', label: 'Configure scoring rules & thresholds' },

  // Approvals engine
  { key: 'approvals.read', group: 'Approvals', label: 'View approval requests' },
  { key: 'approvals.act', group: 'Approvals', label: 'Approve / reject requests assigned to me' },
  { key: 'approvals.configure', group: 'Approvals', label: 'Configure approval workflows' },
  { key: 'excuses.review', group: 'Approvals', label: 'Review absence excuses' },
  { key: 'corrections.review', group: 'Approvals', label: 'Review attendance corrections' },

  // Expenses
  { key: 'expenses.read', group: 'Expenses', label: 'View expenses', finance: true },
  { key: 'expenses.create', group: 'Expenses', label: 'Create expenses', finance: true },
  { key: 'expenses.update', group: 'Expenses', label: 'Edit expenses', finance: true },
  { key: 'expenses.delete', group: 'Expenses', label: 'Delete / cancel expenses', finance: true },
  { key: 'expenses.approve', group: 'Expenses', label: 'Approve expenses', finance: true },

  // Monthly dues
  { key: 'dues.read', group: 'Monthly Dues', label: 'View dues', finance: true },
  { key: 'dues.create', group: 'Monthly Dues', label: 'Create dues periods / assignments', finance: true },
  { key: 'dues.update', group: 'Monthly Dues', label: 'Edit dues / adjustments / exemptions', finance: true },
  { key: 'dues.delete', group: 'Monthly Dues', label: 'Delete dues records', finance: true },
  { key: 'dues.record_payment', group: 'Monthly Dues', label: 'Record dues payments', finance: true },

  // Payments
  { key: 'payments.read', group: 'Payments', label: 'View payments', finance: true },
  { key: 'payments.manage', group: 'Payments', label: 'Verify / amend payments', finance: true },
  { key: 'payments.configure', group: 'Payments', label: 'Configure payment accounts', finance: true },

  // Welfare fund
  { key: 'welfare.read', group: 'Welfare', label: 'View welfare requests', finance: true },
  { key: 'welfare.create', group: 'Welfare', label: 'Create welfare requests', finance: true },
  { key: 'welfare.approve', group: 'Welfare', label: 'Approve welfare requests', finance: true },

  // Messaging
  { key: 'messages.read', group: 'Communication', label: 'Use in-app messaging' },
  { key: 'messages.send', group: 'Communication', label: 'Send messages / announcements' },
  { key: 'messages.moderate', group: 'Communication', label: 'Delete others’ messages' },
  { key: 'messages.manage_rooms', group: 'Communication', label: 'Create / manage chat rooms' },
  { key: 'notifications.send', group: 'Communication', label: 'Send notifications (SMS / email / push)' },

  // Lookup tables
  { key: 'lookups.read', group: 'Lookups', label: 'View lookup tables' },
  { key: 'lookups.manage', group: 'Lookups', label: 'Manage lookup tables' },

  // Reports
  { key: 'reports.view', group: 'Reports', label: 'View reports & dashboards' },
  { key: 'reports.export', group: 'Reports', label: 'Export reports' },

  // Administration
  { key: 'users.read', group: 'Administration', label: 'View admin team' },
  { key: 'users.create', group: 'Administration', label: 'Invite / create admins' },
  { key: 'users.update', group: 'Administration', label: 'Edit admins / assign roles' },
  { key: 'users.deactivate', group: 'Administration', label: 'Deactivate / reactivate admins' },
  { key: 'roles.read', group: 'Administration', label: 'View roles & permissions' },
  { key: 'roles.create', group: 'Administration', label: 'Create custom roles' },
  { key: 'roles.update', group: 'Administration', label: 'Edit role permissions' },
  { key: 'roles.delete', group: 'Administration', label: 'Delete custom roles' },
  { key: 'settings.read', group: 'Administration', label: 'View settings' },
  { key: 'settings.update', group: 'Administration', label: 'Change settings' },
  { key: 'audit.read', group: 'Administration', label: 'View the audit log' },
] as const;

export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOG.map((p) => p.key);

export function isKnownPermission(key: string): boolean {
  return key === PERMISSION_WILDCARD || ALL_PERMISSION_KEYS.includes(key);
}

/**
 * Expand a role's stored permission list into a concrete set, resolving the
 * wildcard. Unknown strings are dropped defensively.
 */
export function expandPermissions(granted: readonly string[]): Set<string> {
  if (granted.includes(PERMISSION_WILDCARD)) return new Set(ALL_PERMISSION_KEYS);
  return new Set(granted.filter((k) => ALL_PERMISSION_KEYS.includes(k)));
}

export function hasAllPermissions(held: Set<string>, required: readonly string[]): boolean {
  if (held.has(PERMISSION_WILDCARD)) return true;
  return required.every((r) => held.has(r));
}

// ---------------------------------------------------------------------------
// System roles + their default grants. Seeded and (re)synced by migrations and
// the seed script. `SUPER_ADMIN` is special-cased everywhere and always holds
// the wildcard.
// ---------------------------------------------------------------------------

export const SYSTEM_ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMINISTRATION: 'ADMINISTRATION',
  FINANCE: 'FINANCE',
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE)[keyof typeof SYSTEM_ROLE];

const NON_FINANCE_KEYS = PERMISSION_CATALOG.filter((p) => !p.finance).map((p) => p.key);
const FINANCE_KEYS = PERMISSION_CATALOG.filter((p) => p.finance).map((p) => p.key);

export const SYSTEM_ROLE_DEFINITIONS: Record<
  SystemRoleKey,
  { name: string; description: string; permissions: string[] }
> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Full, unrestricted access to every module and configuration.',
    permissions: [PERMISSION_WILDCARD],
  },
  ADMINISTRATION: {
    name: 'Administration',
    description:
      'Day-to-day church administration: members, events, attendance, approvals, communication and non-financial reports.',
    permissions: [
      ...NON_FINANCE_KEYS.filter(
        (k) =>
          !k.startsWith('roles.') &&
          !['users.create', 'users.deactivate', 'settings.update', 'audit.read', 'messages.moderate'].includes(k),
      ),
      // Administration can see the team roster but not mint or disable admins.
      'users.read',
    ],
  },
  FINANCE: {
    name: 'Finance',
    description:
      'Financial operations: expenses, monthly dues, payments, welfare fund and financial reports.',
    permissions: [
      ...FINANCE_KEYS,
      'members.read',
      'reports.view',
      'reports.export',
      'lookups.read',
      'lookups.manage',
      'approvals.read',
      'approvals.act',
      'settings.read',
    ],
  },
};

/**
 * Legacy `User.role` enum → access-role fallback, used only for accounts that
 * have no explicit role grants yet (e.g. during the migration window).
 */
export const LEGACY_ROLE_FALLBACK: Record<string, SystemRoleKey | null> = {
  ADMIN: 'SUPER_ADMIN',
  LEADER: 'ADMINISTRATION',
  MEMBER: null,
};

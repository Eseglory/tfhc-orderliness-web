import { ForbiddenException } from '@nestjs/common';

export const AUTHORIZED_PERSONS = {
  ESEOSA_GLORY: 'engreseglory@gmail.com',
  DANIEL_OGUAMANAM: 'danoguamanam@gmail.com',
  JACOB_ONOJA: 'onojamonday123@gmail.com',
  LOVETH_UBABUIKE: 'ngoziloveth41@gmail.com',
  AANU_OYENIRAN: 'aanuoyeniran@gmail.com',
  VICTORIA_OLANREWAJU: 'olarenwajuvictoria@gmail.com',
  CONFORT_STEPHEN: 'comfort.osariroya@gmail.com',
  PASEDA_OLUWAFEMI: 'fpaseda@yahoo.com',
} as const;

export function normalizeEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : '';
}

export function isEseosaGlory(email?: string | null): boolean {
  return normalizeEmail(email) === AUTHORIZED_PERSONS.ESEOSA_GLORY;
}

export function isDaniel(email?: string | null): boolean {
  return normalizeEmail(email) === AUTHORIZED_PERSONS.DANIEL_OGUAMANAM;
}

export function isJacob(email?: string | null): boolean {
  return normalizeEmail(email) === AUTHORIZED_PERSONS.JACOB_ONOJA;
}

export function isLoveth(email?: string | null): boolean {
  return normalizeEmail(email) === AUTHORIZED_PERSONS.LOVETH_UBABUIKE;
}

export function isAanuOrVictoria(email?: string | null): boolean {
  const norm = normalizeEmail(email);
  return (
    norm === AUTHORIZED_PERSONS.AANU_OYENIRAN ||
    norm === AUTHORIZED_PERSONS.VICTORIA_OLANREWAJU ||
    norm === AUTHORIZED_PERSONS.ESEOSA_GLORY
  );
}

export function isConfortOrPaseda(email?: string | null): boolean {
  const norm = normalizeEmail(email);
  return (
    norm === AUTHORIZED_PERSONS.CONFORT_STEPHEN ||
    norm === AUTHORIZED_PERSONS.PASEDA_OLUWAFEMI ||
    norm === AUTHORIZED_PERSONS.ESEOSA_GLORY
  );
}

/**
 * Enforce that only Eseosa Glory has CRUD authority over Finance.
 */
export function isFinanceCrudAuthorized(user?: { email?: string | null; isSuperAdmin?: boolean; permissions?: string[] } | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions?.includes('*')) return true;
  return isEseosaGlory(user.email);
}

export function assertFinanceCrudAuthority(user: { email?: string | null; isSuperAdmin?: boolean; permissions?: string[] }) {
  if (!isFinanceCrudAuthorized(user)) {
    throw new ForbiddenException(
      'Finance CRUD authority is restricted exclusively to the Platform Owner (Eseosa Glory).'
    );
  }
}

/**
 * Enforce that only Aanu and Victoria (and Super Admin Eseosa Glory) can create wardrobe records.
 */
export function isWardrobeCreateAuthorized(user?: { email?: string | null; isSuperAdmin?: boolean; permissions?: string[] } | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions?.includes('*') || user.permissions?.includes('wardrobe.manage')) return true;
  return isAanuOrVictoria(user.email);
}

export function assertWardrobeCreateAuthority(user: { email?: string | null; isSuperAdmin?: boolean; permissions?: string[] }) {
  if (!isWardrobeCreateAuthorized(user)) {
    throw new ForbiddenException(
      'Only Aanu and Victoria are authorized to manage wardrobe records.'
    );
  }
}

/**
 * Enforce that only Confort and Paseda (and Super Admin Eseosa Glory) can create services/meetings under Events.
 */
export function isEventCreateAuthorized(user?: { email?: string | null; isSuperAdmin?: boolean; permissions?: string[] } | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions?.includes('*') || user.permissions?.includes('events.create')) return true;
  return isConfortOrPaseda(user.email);
}

export function assertEventCreateAuthority(user: { email?: string | null; isSuperAdmin?: boolean; permissions?: string[] }, eventType = 'events') {
  if (!isEventCreateAuthorized(user)) {
    throw new ForbiddenException(
      `Only Confort and Paseda are authorized to create ${eventType} under Events.`
    );
  }
}

/**
 * Validate approval authority for an absence excuse or request:
 * - If requester is Jacob: ONLY Daniel is authorized to approve/reject.
 * - For other members: Disciplinary Committee / staff with review permissions can approve.
 */
export function isAbsenceApprovalAuthorized(
  actor: { email?: string | null; isSuperAdmin?: boolean; permissions?: string[] },
  requester?: { email?: string | null } | string | null
): boolean {
  const reqEmail = typeof requester === 'string' ? requester : requester?.email;
  if (isJacob(reqEmail)) {
    return isDaniel(actor?.email);
  }
  return true;
}

export function assertAbsenceApprovalAuthority(
  requesterEmail: string | undefined | null,
  actor: { email?: string | null; isSuperAdmin?: boolean; permissions?: string[] }
) {
  if (!isAbsenceApprovalAuthorized(actor, requesterEmail)) {
    throw new ForbiddenException(
      "Only Daniel is authorized to approve Jacob's requests."
    );
  }
}

/**
 * Validate approval authority for a Fund or Expense request:
 * - If requester is Loveth: ONLY Eseosa Glory or Daniel can approve/reject.
 * - Self-approval is strictly forbidden.
 */
export function isFundExpenseApprovalAuthorized(
  actor: { email?: string | null; userId?: string },
  requester?: { email?: string | null } | string | null
): boolean {
  const actorEmail = normalizeEmail(actor?.email);
  const reqEmail = normalizeEmail(typeof requester === 'string' ? requester : requester?.email);

  if (reqEmail && actorEmail && actorEmail === reqEmail) {
    return false;
  }

  if (isLoveth(reqEmail)) {
    return isEseosaGlory(actorEmail) || isDaniel(actorEmail);
  }
  return true;
}

export function assertFundExpenseApprovalAuthority(
  requesterEmail: string | undefined | null,
  actor: { email?: string | null; userId?: string }
) {
  const actorEmail = normalizeEmail(actor?.email);
  const reqEmail = normalizeEmail(requesterEmail);

  if (reqEmail && actorEmail && actorEmail === reqEmail) {
    throw new ForbiddenException('Self-approval is not permitted for financial requests.');
  }

  if (!isFundExpenseApprovalAuthorized(actor, reqEmail)) {
    throw new ForbiddenException(
      "Only Eseosa Glory and Daniel are authorized to approve Loveth's fund and expense requests."
    );
  }
}


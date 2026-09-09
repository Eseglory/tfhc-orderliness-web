/**
 * Event audience / visibility resolution, shared by the events module and the
 * attendance check-in path. A RESTRICTED event is visible only to staff and to
 * members who match one of its audience rows.
 */

export interface AudienceLike {
  scope: 'ALL_MEMBERS' | 'EXECUTIVES' | 'ADMINS' | null;
  memberId: string | null;
  subTeamId: string | null;
}

export interface EventViewer {
  memberId?: string | null;
  subTeamId?: string | null;
  roleInUnit?: string | null;
  /** ADMIN / LEADER accounts (and Super Admins) always see every event. */
  isStaff?: boolean;
}

const EXECUTIVE_ROLE = /president|vice|secretary|treasurer|financial|coordinator|\bhead\b|leader|executive|chairman|chairperson|director/i;

export function isExecutiveRole(roleInUnit?: string | null): boolean {
  return EXECUTIVE_ROLE.test(roleInUnit ?? '');
}

export function canViewEvent(
  visibility: string,
  audiences: AudienceLike[],
  viewer: EventViewer,
): boolean {
  if (visibility !== 'RESTRICTED') return true;
  if (viewer.isStaff) return true;
  if (!viewer.memberId) return false;
  return audiences.some((a) => {
    if (a.memberId && a.memberId === viewer.memberId) return true;
    if (a.subTeamId && viewer.subTeamId && a.subTeamId === viewer.subTeamId) return true;
    if (a.scope === 'ALL_MEMBERS') return true;
    if (a.scope === 'EXECUTIVES' && isExecutiveRole(viewer.roleInUnit)) return true;
    if (a.scope === 'ADMINS' && viewer.isStaff) return true;
    return false;
  });
}

/** Prisma `where` fragment that keeps only events a given member may see.
 *  Pass into `meeting.findMany({ where: { AND: [ ..., visibilityWhere(viewer) ] } })`. */
export function visibilityWhere(viewer: EventViewer): object {
  if (viewer.isStaff) return {};
  const or: object[] = [{ visibility: 'PUBLIC' }];
  if (viewer.memberId) {
    const audienceOr: object[] = [
      { audiences: { some: { memberId: viewer.memberId } } },
      { audiences: { some: { scope: 'ALL_MEMBERS' } } },
    ];
    if (viewer.subTeamId) audienceOr.push({ audiences: { some: { subTeamId: viewer.subTeamId } } });
    if (isExecutiveRole(viewer.roleInUnit)) audienceOr.push({ audiences: { some: { scope: 'EXECUTIVES' } } });
    or.push({ AND: [{ visibility: 'RESTRICTED' }, { OR: audienceOr }] });
  }
  return { OR: or };
}

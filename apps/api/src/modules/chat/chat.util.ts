import { isExecutiveRole, isDisciplinaryRole } from '../../common/event-visibility';

/**
 * The subset of the authenticated principal the chat module needs. Compatible
 * with `AuthenticatedUser` from the JWT strategy and with the lighter object the
 * WebSocket gateway builds during the handshake.
 */
export interface ChatViewer {
  userId: string;
  email?: string | null;
  memberId?: string | null;
  role: string;
  roleInUnit?: string | null;
  subTeamName?: string | null;
  permissions: string[];
  isSuperAdmin?: boolean;
  firstName?: string | null;
  lastName?: string | null;
}

export const DISCIPLINARY_EMAILS = [
  'dotunakingbesote@gmail.com',
  'onojamonday123@gmail.com',
  'nicoleokafor0@gmail.com',
];

/** Stable key for a 1:1 conversation, independent of who opened it. */
export function directKey(memberA: string, memberB: string): string {
  return [memberA, memberB].sort().join(':');
}

export function viewerCanModerate(viewer: ChatViewer): boolean {
  return (
    viewer.isSuperAdmin === true ||
    viewer.permissions.includes('*') ||
    viewer.permissions.includes('messages.moderate')
  );
}

export function viewerManagesRooms(viewer: ChatViewer): boolean {
  return (
    viewer.isSuperAdmin === true ||
    viewer.permissions.includes('*') ||
    viewer.permissions.includes('messages.manage_rooms')
  );
}

/**
 * Executive access to the EXECUTIVES room: any staff account (ADMIN / LEADER) or
 * a member whose `roleInUnit` reads as an executive position.
 */
export function viewerIsExecutive(viewer: ChatViewer): boolean {
  if (viewer.role && viewer.role !== 'MEMBER') return true;
  if (viewer.isSuperAdmin) return true;
  return isExecutiveRole(viewer.roleInUnit ?? null);
}

/**
 * Disciplinary access to the DISCIPLINARY room: any staff account, super admin,
 * member in the Disciplinary Committee subTeam, or member with a disciplinary role/permission.
 */
export function viewerIsDisciplinary(viewer: ChatViewer): boolean {
  if (viewer.role && viewer.role !== 'MEMBER') return true;
  if (viewer.isSuperAdmin) return true;
  if (
    viewer.permissions.includes('*') ||
    viewer.permissions.includes('excuses.review') ||
    viewer.permissions.includes('flags.manage')
  ) {
    return true;
  }
  if (viewer.email && DISCIPLINARY_EMAILS.includes(viewer.email.toLowerCase().trim())) {
    return true;
  }
  if (viewer.subTeamName && /disciplinary/i.test(viewer.subTeamName)) {
    return true;
  }
  return isDisciplinaryRole(viewer.roleInUnit ?? null);
}



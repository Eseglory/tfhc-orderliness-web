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

export const DISCIPLINARY_EXCLUDED_EMAILS = [
  'koladeinfo@gmail.com',
  'engreseglory@gmail.com',
  'gloryeseosa@gmail.com',
];

/**
 * Disciplinary access to the DISCIPLINARY room: strictly for members belonging
 * to the Disciplinary Committee, designated committee emails, or members with
 * explicit disciplinary unit roles / permissions. General admins and excluded users
 * (such as Kolade Abiodun and Glory) do not have access.
 */
export function viewerIsDisciplinary(viewer: ChatViewer): boolean {
  const email = viewer.email?.toLowerCase().trim();
  if (email && DISCIPLINARY_EXCLUDED_EMAILS.includes(email)) {
    return false;
  }
  const fullName = `${viewer.firstName || ''} ${viewer.lastName || ''}`.toLowerCase();
  if (
    fullName.includes('kolade') ||
    (fullName.includes('glory') && !fullName.includes('dotun') && !fullName.includes('jacob') && !fullName.includes('nicole'))
  ) {
    return false;
  }
  if (viewer.isSuperAdmin === true || viewer.permissions?.includes('*')) {
    return true;
  }
  if (viewer.role === 'ADMIN' || viewer.role === 'LEADER') {
    return true;
  }
  if (email && DISCIPLINARY_EMAILS.includes(email)) {
    return true;
  }
  if (viewer.subTeamName && /disciplinary/i.test(viewer.subTeamName)) {
    return true;
  }
  if (isDisciplinaryRole(viewer.roleInUnit ?? null)) {
    return true;
  }
  if (
    viewer.permissions?.includes('excuses.review') ||
    viewer.permissions?.includes('flags.manage')
  ) {
    return true;
  }
  return false;
}



import {
  directKey,
  viewerCanModerate,
  viewerIsExecutive,
  viewerIsDisciplinary,
  viewerManagesRooms,
  ChatViewer,
} from '../src/modules/chat/chat.util';
import { isDisciplinaryRole } from '../src/common/event-visibility';

const base: ChatViewer = { userId: 'u1', memberId: 'm1', role: 'MEMBER', permissions: [] };

describe('chat.util', () => {
  test('directKey is stable regardless of argument order', () => {
    expect(directKey('b', 'a')).toBe('a:b');
    expect(directKey('a', 'b')).toBe(directKey('b', 'a'));
  });

  test('viewerCanModerate honours wildcard, explicit permission and super admin', () => {
    expect(viewerCanModerate(base)).toBe(false);
    expect(viewerCanModerate({ ...base, permissions: ['messages.moderate'] })).toBe(true);
    expect(viewerCanModerate({ ...base, permissions: ['*'] })).toBe(true);
    expect(viewerCanModerate({ ...base, isSuperAdmin: true })).toBe(true);
  });

  test('viewerManagesRooms requires messages.manage_rooms or elevation', () => {
    expect(viewerManagesRooms({ ...base, permissions: ['messages.send'] })).toBe(false);
    expect(viewerManagesRooms({ ...base, permissions: ['messages.manage_rooms'] })).toBe(true);
  });

  test('viewerIsExecutive: staff accounts and executive roleInUnit qualify', () => {
    expect(viewerIsExecutive(base)).toBe(false);
    expect(viewerIsExecutive({ ...base, roleInUnit: 'President' })).toBe(true);
    expect(viewerIsExecutive({ ...base, roleInUnit: 'Financial Secretary' })).toBe(true);
    expect(viewerIsExecutive({ ...base, role: 'ADMIN' })).toBe(true);
    expect(viewerIsExecutive({ ...base, roleInUnit: 'Member' })).toBe(false);
  });

  test('viewerIsDisciplinary: staff, super admin, permissions and disciplinary roleInUnit qualify', () => {
    expect(viewerIsDisciplinary(base)).toBe(false);
    expect(viewerIsDisciplinary({ ...base, role: 'ADMIN' })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, role: 'LEADER' })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, isSuperAdmin: true })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, permissions: ['excuses.review'] })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, permissions: ['flags.manage'] })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, permissions: ['*'] })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, roleInUnit: 'Disciplinary Committee Member' })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, roleInUnit: 'Ethics & Conduct Officer' })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, roleInUnit: 'Tribunal Chair' })).toBe(true);
    expect(viewerIsDisciplinary({ ...base, roleInUnit: 'Usher' })).toBe(false);
  });

  test('isDisciplinaryRole recognizes disciplinary keywords', () => {
    expect(isDisciplinaryRole('Disciplinary Committee')).toBe(true);
    expect(isDisciplinaryRole('Ethics Lead')).toBe(true);
    expect(isDisciplinaryRole('Conduct Team')).toBe(true);
    expect(isDisciplinaryRole('Tribunal Member')).toBe(true);
    expect(isDisciplinaryRole('General Member')).toBe(false);
    expect(isDisciplinaryRole(null)).toBe(false);
  });
});

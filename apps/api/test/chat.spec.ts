import { directKey, viewerCanModerate, viewerIsExecutive, viewerManagesRooms, ChatViewer } from '../src/modules/chat/chat.util';

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
});

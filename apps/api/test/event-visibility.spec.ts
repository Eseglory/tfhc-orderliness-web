import { canViewEvent, visibilityWhere, isExecutiveRole } from '../src/common/event-visibility';

const A = (over: Partial<Parameters<typeof canViewEvent>[1][number]> = {}) => ({
  scope: null,
  memberId: null,
  subTeamId: null,
  ...over,
});

describe('event visibility', () => {
  it('PUBLIC events are visible to everyone', () => {
    expect(canViewEvent('PUBLIC', [], {})).toBe(true);
    expect(canViewEvent('PUBLIC', [], { memberId: 'm1' })).toBe(true);
  });

  it('staff always see RESTRICTED events', () => {
    expect(canViewEvent('RESTRICTED', [], { isStaff: true })).toBe(true);
  });

  it('RESTRICTED: anonymous / unlisted members are blocked', () => {
    expect(canViewEvent('RESTRICTED', [A({ memberId: 'm1' })], {})).toBe(false);
    expect(canViewEvent('RESTRICTED', [A({ memberId: 'm1' })], { memberId: 'm2' })).toBe(false);
  });

  it('RESTRICTED: direct member, sub-team and scope matches', () => {
    expect(canViewEvent('RESTRICTED', [A({ memberId: 'm1' })], { memberId: 'm1' })).toBe(true);
    expect(canViewEvent('RESTRICTED', [A({ subTeamId: 's1' })], { memberId: 'm1', subTeamId: 's1' })).toBe(true);
    expect(canViewEvent('RESTRICTED', [A({ subTeamId: 's1' })], { memberId: 'm1', subTeamId: 's2' })).toBe(false);
    expect(canViewEvent('RESTRICTED', [A({ scope: 'ALL_MEMBERS' })], { memberId: 'm1' })).toBe(true);
  });

  it('EXECUTIVES scope keys off roleInUnit', () => {
    expect(isExecutiveRole('Unit Secretary')).toBe(true);
    expect(isExecutiveRole('Member')).toBe(false);
    expect(canViewEvent('RESTRICTED', [A({ scope: 'EXECUTIVES' })], { memberId: 'm1', roleInUnit: 'Vice President' })).toBe(true);
    expect(canViewEvent('RESTRICTED', [A({ scope: 'EXECUTIVES' })], { memberId: 'm1', roleInUnit: 'Member' })).toBe(false);
  });

  it('visibilityWhere: staff get no filter, members get an OR', () => {
    expect(visibilityWhere({ isStaff: true })).toEqual({});
    const w = visibilityWhere({ memberId: 'm1', subTeamId: 's1', roleInUnit: 'Coordinator' }) as { OR: unknown[] };
    expect(w.OR).toContainEqual({ visibility: 'PUBLIC' });
    expect(JSON.stringify(w)).toContain('EXECUTIVES');
    expect(JSON.stringify(w)).toContain('s1');
  });
});

import { MembersService } from '../src/modules/members/members.service';

describe('Member profile details', () => {
  const update = jest.fn().mockResolvedValue({});
  const findUniqueOrThrow = jest.fn().mockResolvedValue({ id: 'member' });
  const tx = { member: { update, findUniqueOrThrow } };
  const transaction = jest.fn((fn) => fn(tx));
  const mockCache = { wrap: jest.fn((k, t, fn) => fn()), invalidateTag: jest.fn(), invalidateTags: jest.fn() } as any;
  const service = new MembersService({ $transaction: transaction } as any, mockCache, {} as any);
  beforeEach(() => jest.clearAllMocks());

  it('saves a yearless birthday and profession, clears optional details, and ignores account privileges', async () => {
    await service.updateSelfProfile('member', { birthday: '02-29', profession: ' Engineer ', gender: 'Female', address: '', role: 'ADMIN', status: 'ACTIVE' });
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({ birthday: '02-29', profession: 'Engineer', gender: 'Female', address: null });
    expect(data).not.toHaveProperty('role');
    expect(data).not.toHaveProperty('status');
  });

  it('rejects email changes before writing', async () => {
    await expect(service.updateSelfProfile('member', { email: 'changed@example.com' })).rejects.toThrow('Email cannot be changed');
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([{ birthday: '02-30' }, { birthday: '13-01' }, { dateOfBirth: '2001-02-29' }, { firstName: ' ' }])('rejects invalid details %j', async dto => {
    await expect(service.updateSelfProfile('member', dto)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});

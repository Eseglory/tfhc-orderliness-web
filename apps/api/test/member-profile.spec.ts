import { MembersService } from '../src/modules/members/members.service';
const sharp: typeof import('sharp').default = require('sharp');

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

  it('invalidates member lists and leaderboards after photo upload and removal', async () => {
    const photos = new MembersService({ member: { update } } as any, mockCache, {} as any);
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const result = await photos.updatePhoto('member', { buffer, size: buffer.length });
    expect(result.profilePhotoUrl).toMatch(/^data:image\/webp;base64,/);
    expect(mockCache.invalidateTags).toHaveBeenCalledWith(['members', 'leaderboard', 'dashboard']);
    mockCache.invalidateTags.mockClear();
    await photos.removePhoto('member');
    expect(mockCache.invalidateTags).toHaveBeenCalledWith(['members', 'leaderboard', 'dashboard']);
  });
});

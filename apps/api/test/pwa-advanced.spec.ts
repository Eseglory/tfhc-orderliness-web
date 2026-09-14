import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PwaService } from '../src/modules/pwa/pwa.service';
import { ResumableUploadsService } from '../src/modules/chat/resumable-uploads.service';
import { createHash } from 'crypto';

describe('Scoped PWA authorization and diagnostics', () => {
  const prisma = { pwaDeviceSession: { create: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() } };
  const auth = { validate: jest.fn().mockResolvedValue({ memberId: 'member' }) };
  const members = { readNotifications: jest.fn().mockResolvedValue({ count: 1 }) };
  const service = new PwaService(prisma as any, auth as any, members as any);
  beforeEach(() => jest.clearAllMocks());
  test('stores only a grant hash with an expiry no longer than the main session', async () => {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const result = await service.issue('user', Math.floor(Date.now() / 1000), expires);
    const data = prisma.pwaDeviceSession.create.mock.calls[0][0].data;
    expect(data.tokenHash).not.toEqual(result.grant);
    expect(data.tokenHash).toBe(createHash('sha256').update(result.grant).digest('hex'));
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(expires * 1000);
  });
  test('rejects another account, expired grants and logged-out sessions', async () => {
    const base = { userId: 'user', expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), issuedAt: new Date(), user: { role: 'MEMBER', email: 'm@example.test' } };
    for (const data of [{ ...base, userId: 'other' }, { ...base, expiresAt: new Date(0) }, { ...base, user: { ...base.user, lastLogoutAt: new Date(Date.now() + 1000) } }]) {
      prisma.pwaDeviceSession.findUnique.mockResolvedValue(data);
      await expect(service.read('a'.repeat(43), { owner: 'user', ids: ['notice'] })).rejects.toThrow(UnauthorizedException);
    }
    expect(members.readNotifications).not.toHaveBeenCalled();
  });
  test('never permits an implicit mark-all or general mutation with a background grant', async () => {
    prisma.pwaDeviceSession.findUnique.mockResolvedValue({ userId: 'user', expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), issuedAt: new Date(), user: { role: 'MEMBER', email: 'm@example.test' } });
    await expect(service.read('a'.repeat(43), { owner: 'user' })).rejects.toThrow(BadRequestException);
    await service.read('a'.repeat(43), { owner: 'user', ids: ['notice'] });
    expect(members.readNotifications).toHaveBeenCalledWith('member', ['notice']);
  });
  test('rejects arbitrary telemetry dimensions and excessive batches', () => {
    expect(() => service.metrics({ events: [{ name: 'password', value: 1 }] })).toThrow(BadRequestException);
    expect(() => service.metrics({ events: Array(21).fill({ name: 'LCP', value: 1000 }) })).toThrow(BadRequestException);
    expect(service.metrics({ events: [{ name: 'LCP', value: 1000, url: 'ignored', userId: 'ignored' }] })).toEqual({ accepted: 1 });
  });
});

describe('Resumable upload boundaries', () => {
  const viewer = { userId: 'user', memberId: 'member', role: 'MEMBER', permissions: [] };
  const row = { id: 'upload', userId: 'user', roomId: 'room', data: Buffer.from('abc'), offset: 3, size: 6, messageId: null };
  const prisma = { resumableUpload: { findFirst: jest.fn(), updateMany: jest.fn() } };
  const chat = { getRoom: jest.fn() };
  const service = new ResumableUploadsService(prisma as any, chat as any, {} as any, {} as any);
  beforeEach(() => { jest.clearAllMocks(); prisma.resumableUpload.findFirst.mockResolvedValue(row); prisma.resumableUpload.updateMany.mockResolvedValue({ count: 1 }); });
  test('duplicate chunk acknowledgements do not append bytes again', async () => {
    expect((await service.chunk('upload', viewer, 0, Buffer.from('abc'))).offset).toBe(3);
    expect(prisma.resumableUpload.updateMany).not.toHaveBeenCalled();
  });
  test('rejects offset conflicts, corrupt duplicate chunks and oversized chunks', async () => {
    await expect(service.chunk('upload', viewer, 1, Buffer.from('wrong'))).rejects.toThrow();
    await expect(service.chunk('upload', viewer, 4, Buffer.from('x'))).rejects.toThrow();
    await expect(service.chunk('upload', viewer, 3, Buffer.alloc(262145))).rejects.toThrow();
  });
  test('advances offsets atomically and scopes all queries to the owner', async () => {
    expect((await service.chunk('upload', viewer, 3, Buffer.from('def'))).offset).toBe(6);
    expect(prisma.resumableUpload.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'user' }) }));
    expect(prisma.resumableUpload.updateMany).toHaveBeenCalledWith({ where: { id: 'upload', userId: 'user', offset: 3, messageId: null }, data: { data: Buffer.from('abcdef'), offset: 6 } });
  });
});

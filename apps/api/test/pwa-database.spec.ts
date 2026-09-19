import { PwaService } from '../src/modules/pwa/pwa.service';
import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';
import { ChatService } from '../src/modules/chat/chat.service';
import { ChatAttachmentsService } from '../src/modules/chat/chat-attachments.service';
import { ResumableUploadsService } from '../src/modules/chat/resumable-uploads.service';
import { MembersService } from '../src/modules/members/members.service';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
const database = process.env.PWA_TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_pwa_e2e(?:\?|$)/.test(database)) throw new Error('PWA integration tests require the isolated local PWA database');
if (!database) {
  describe.skip('PWA database contracts', () => { test('skipped', () => {}); });
} else {
describe('PWA database contracts', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: database } } });
  const cache = { wrap: (_key: string, _ttl: number, run: () => unknown) => run() };
  const chat = new ChatService(prisma as any, { record: jest.fn() } as any, {} as any, {} as any);
  const uploads = new ResumableUploadsService(prisma as any, chat, new ChatAttachmentsService(), { fanOut: jest.fn() } as any);
  const auth = new JwtStrategy({ getOrThrow: () => 'isolated-test-secret' } as any, prisma as any, {} as any, cache as any);
  const pwa = new PwaService(prisma as any, auth, new MembersService(prisma as any, cache as any, {} as any));
  const userId = randomUUID(), memberId = randomUUID(), roomId = randomUUID();
  const viewer = { userId, memberId, role: 'MEMBER', permissions: [] };
  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, passwordHash: 'unused', member: { create: { id: memberId, memberCode: userId, firstName: 'PWA', lastName: 'Test', phoneNumber: '000' } } } });
    await prisma.chatRoom.create({ data: { id: roomId, type: 'CUSTOM', name: 'PWA test', members: { create: { memberId } } } });
  });
  afterAll(async () => { await prisma.chatRoom.delete({ where: { id: roomId } }); await prisma.member.delete({ where: { id: memberId } }); await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect(); });
  test('interrupted chunks resume and concurrent completion creates exactly one message', async () => {
    const file = Buffer.from('A resumable file'); const uploadId = randomUUID();
    const input = { uploadId, roomId, size: file.length, sha256: createHash('sha256').update(file).digest('hex'), name: 'notes.txt', mime: 'text/plain' };
    await uploads.begin(viewer, input); await uploads.chunk(uploadId, viewer, 0, file.subarray(0, 5));
    expect((await uploads.begin(viewer, input)).offset).toBe(5);
    await uploads.chunk(uploadId, viewer, 5, file.subarray(5));
    const results = await Promise.all(Array.from({ length: 8 }, () => uploads.complete(uploadId, viewer)));
    expect(new Set(results.map(message => message.id)).size).toBe(1);
    expect(await prisma.chatMessage.count({ where: { clientOperationId: `upload:${uploadId}` } })).toBe(1);
    expect((await prisma.resumableUpload.findUniqueOrThrow({ where: { id: uploadId } })).data.length).toBe(0);
    expect((await uploads.complete(uploadId, viewer)).id).toBe(results[0].id);
  });
  test('a scoped grant marks only selected owned IDs and fails after logout', async () => {
    const first = await prisma.memberNotification.create({ data: { memberId, type: 'TEST', title: 'First', body: 'Test' } });
    const second = await prisma.memberNotification.create({ data: { memberId, type: 'TEST', title: 'Second', body: 'Test' } });
    const session = await pwa.issue(userId, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 600);
    await pwa.read(session.grant, { owner: userId, ids: [first.id] });
    expect((await prisma.memberNotification.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('UNREAD');
    await prisma.user.update({ where: { id: userId }, data: { lastLogoutAt: new Date(Date.now() + 1000) } });
    await expect(pwa.read(session.grant, { owner: userId, ids: [second.id] })).rejects.toThrow();
  });
  });
}

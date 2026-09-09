import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { io, Socket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/common/rbac/rbac.service';

const database = process.env.TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Tests require a local tfhc_e2e database');
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');

describe('In-app chat: rooms, direct messages, moderation, realtime (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let baseUrl: string;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  let superToken: string;
  let execToken: string;
  let aliceToken: string;
  let bobToken: string;
  let aliceId: string;
  let bobId: string;
  let execId: string;
  const createdRoomIds: string[] = [];
  const testMemberIds: string[] = [];
  const openSockets: Socket[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-local-only-secret';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    const port = (app.getHttpServer().address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    app.get(SchedulerRegistry).getCronJobs().forEach((j) => j.stop());
    db = app.get(PrismaService);
    await app.get(RbacService).syncSystemRoles();
    await app.get(AuthService); // warm
    const tokens = app.get(AuthService);
    const pw = await argon2.hash('E2ePassword!123');

    const superRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    const su = await db.user.create({
      data: {
        email: `chatsuper-${run}@example.test`, passwordHash: pw, role: 'ADMIN',
        member: { create: { memberCode: `CHS-${run}`, firstName: 'Casey', lastName: 'Super', phoneNumber: '08010000040', roleInUnit: 'Coordinator' } },
      },
      include: { member: true },
    });
    await db.userAccessRole.create({ data: { userId: su.id, roleId: superRole.id } });
    superToken = tokens.generateToken(su.id, su.email, 'ADMIN', su.member!.id);
    testMemberIds.push(su.member!.id);

    const exec = await db.user.create({
      data: {
        email: `chatexec-${run}@example.test`, passwordHash: pw, role: 'MEMBER',
        member: { create: { memberCode: `CHE-${run}`, firstName: 'Ese', lastName: 'Exec', phoneNumber: '08010000041', roleInUnit: 'President' } },
      },
      include: { member: true },
    });
    execId = exec.member!.id;
    execToken = tokens.generateToken(exec.id, exec.email, 'MEMBER', execId);
    testMemberIds.push(execId);

    const alice = await db.user.create({
      data: {
        email: `chatalice-${run}@example.test`, passwordHash: pw, role: 'MEMBER',
        member: { create: { memberCode: `CHA-${run}`, firstName: 'Alice', lastName: 'Doe', phoneNumber: '08010000042', roleInUnit: 'Member' } },
      },
      include: { member: true },
    });
    aliceId = alice.member!.id;
    aliceToken = tokens.generateToken(alice.id, alice.email, 'MEMBER', aliceId);
    testMemberIds.push(aliceId);

    const bob = await db.user.create({
      data: {
        email: `chatbob-${run}@example.test`, passwordHash: pw, role: 'MEMBER',
        member: { create: { memberCode: `CHB-${run}`, firstName: 'Bob', lastName: 'Roe', phoneNumber: '08010000043', roleInUnit: 'Member' } },
      },
      include: { member: true },
    });
    bobId = bob.member!.id;
    bobToken = tokens.generateToken(bob.id, bob.email, 'MEMBER', bobId);
    testMemberIds.push(bobId);
  }, 45000);

  afterAll(async () => {
    openSockets.forEach((s) => {
      s.removeAllListeners();
      s.disconnect();
      s.close();
    });
    await new Promise((r) => setTimeout(r, 100));
    if (db) {
      await db.chatMessage.deleteMany({ where: { OR: [{ roomId: { in: createdRoomIds } }, { senderMemberId: { in: testMemberIds } }] } });
      await db.chatRoomMember.deleteMany({ where: { OR: [{ roomId: { in: createdRoomIds } }, { memberId: { in: testMemberIds } }] } });
      await db.chatRoom.deleteMany({ where: { id: { in: createdRoomIds } } });
      await db.auditLog.deleteMany({ where: { actorUser: { email: { endsWith: `-${run}@example.test` } } } });
      await db.member.deleteMany({ where: { id: { in: testMemberIds } } });
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
    }
    if (app) await app.close();
  });

  const socket = (token?: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const s = io(`${baseUrl}/chat`, { transports: ['websocket'], auth: token ? { token } : {}, reconnection: false, timeout: 4000 });
      openSockets.push(s);
      s.on('ready', () => resolve(s));
      s.on('connect_error', (e) => reject(e));
      s.on('disconnect', () => reject(new Error('disconnected')));
      setTimeout(() => reject(new Error('no ready event')), 4000);
    });

  test('system rooms: General is visible to all; Executives only to executives/staff', async () => {
    const aliceRooms = (await http().get('/chat/rooms').set(auth(aliceToken)).expect(200)).body;
    expect(aliceRooms.map((r: any) => r.key)).toContain('GENERAL');
    expect(aliceRooms.map((r: any) => r.key)).not.toContain('EXECUTIVES');

    const execRooms = (await http().get('/chat/rooms').set(auth(execToken)).expect(200)).body;
    expect(execRooms.map((r: any) => r.key)).toEqual(expect.arrayContaining(['GENERAL', 'EXECUTIVES']));

    const superRooms = (await http().get('/chat/rooms').set(auth(superToken)).expect(200)).body;
    expect(superRooms.map((r: any) => r.key)).toContain('EXECUTIVES');

    const execRoomId = execRooms.find((r: any) => r.key === 'EXECUTIVES').id;
    await http().get(`/chat/rooms/${execRoomId}/messages`).set(auth(aliceToken)).expect(403);
  });

  test('posting to General: recipients get an unread count that clears on read', async () => {
    const generalId = (await http().get('/chat/rooms').set(auth(aliceToken)).expect(200)).body.find((r: any) => r.key === 'GENERAL').id;

    // Bob reads first so his lastReadAt is set to "now".
    await http().post(`/chat/rooms/${generalId}/read`).set(auth(bobToken)).expect(201);

    const msg = (await http().post(`/chat/rooms/${generalId}/messages`).set(auth(aliceToken)).send({ body: `Hello unit ${run}` }).expect(201)).body;
    expect(msg.body).toBe(`Hello unit ${run}`);
    expect(msg.sender.memberId).toBe(aliceId);
    expect(msg.mine).toBe(true);

    const bobRooms = (await http().get('/chat/rooms').set(auth(bobToken)).expect(200)).body;
    const bobGeneral = bobRooms.find((r: any) => r.id === generalId);
    expect(bobGeneral.unreadCount).toBeGreaterThanOrEqual(1);
    expect(bobGeneral.lastMessage.body).toBe(`Hello unit ${run}`);

    const senderRooms = (await http().get('/chat/rooms').set(auth(aliceToken)).expect(200)).body;
    expect(senderRooms.find((r: any) => r.id === generalId).unreadCount).toBe(0);

    await http().post(`/chat/rooms/${generalId}/read`).set(auth(bobToken)).send({ messageId: msg.id }).expect(201);
    const bobRooms2 = (await http().get('/chat/rooms').set(auth(bobToken)).expect(200)).body;
    expect(bobRooms2.find((r: any) => r.id === generalId).unreadCount).toBe(0);
  });

  test('direct messages: a 1:1 room is created once and both sides converge on it', async () => {
    const room = (await http().post(`/chat/direct/${bobId}`).set(auth(aliceToken)).expect(201)).body;
    expect(room.type).toBe('DIRECT');
    expect(room.direct.memberId).toBe(bobId);
    createdRoomIds.push(room.id);

    // Opening again from either direction returns the same room.
    const again = (await http().post(`/chat/direct/${aliceId}`).set(auth(bobToken)).expect(201)).body;
    expect(again.id).toBe(room.id);

    await http().post(`/chat/rooms/${room.id}/messages`).set(auth(aliceToken)).send({ body: 'hi bob' }).expect(201);
    const bobDm = (await http().get('/chat/rooms').set(auth(bobToken)).expect(200)).body.find((r: any) => r.id === room.id);
    expect(bobDm.name).toContain('Alice');
    expect(bobDm.unreadCount).toBe(1);

    // A third member cannot read someone else's DM.
    await http().get(`/chat/rooms/${room.id}/messages`).set(auth(execToken)).expect(403);
  });

  test('custom rooms: manage_rooms creates & adds members; outsiders are blocked; moderation + edit', async () => {
    await http().post('/chat/rooms').set(auth(aliceToken)).send({ name: 'nope' }).expect(403);

    const room = (await http().post('/chat/rooms').set(auth(superToken)).send({ name: `Choir ${run}`, memberIds: [aliceId] }).expect(201)).body;
    createdRoomIds.push(room.id);
    expect(room.type).toBe('CUSTOM');
    expect(room.role).toBe('MODERATOR');

    const members = (await http().get(`/chat/rooms/${room.id}/members`).set(auth(superToken)).expect(200)).body;
    expect(members.map((m: any) => m.memberId)).toEqual(expect.arrayContaining([aliceId]));

    // Bob was not added.
    await http().get(`/chat/rooms/${room.id}/messages`).set(auth(bobToken)).expect(403);
    await http().post(`/chat/rooms/${room.id}/messages`).set(auth(bobToken)).send({ body: 'sneak' }).expect(403);

    const mine = (await http().post(`/chat/rooms/${room.id}/messages`).set(auth(aliceToken)).send({ body: 'first draft' }).expect(201)).body;

    const edited = (await http().patch(`/chat/messages/${mine.id}`).set(auth(aliceToken)).send({ body: 'final draft' }).expect(200)).body;
    expect(edited.body).toBe('final draft');
    expect(edited.editedAt).toBeTruthy();

    // Alice cannot edit someone else's; super (moderator) can delete anyone's.
    const supMsg = (await http().post(`/chat/rooms/${room.id}/messages`).set(auth(superToken)).send({ body: 'from super' }).expect(201)).body;
    await http().patch(`/chat/messages/${supMsg.id}`).set(auth(aliceToken)).send({ body: 'hijack' }).expect(403);

    const removed = (await http().delete(`/chat/messages/${mine.id}`).set(auth(superToken)).expect(200)).body;
    expect(removed.deletedAt).toBeTruthy();
    expect(removed.body).toBeNull();

    const audit = await db.auditLog.findFirst({ where: { action: 'CHAT_MESSAGE_MODERATED', entityId: mine.id } });
    expect(audit).toBeTruthy();

    // Add Bob, then he can post.
    await http().post(`/chat/rooms/${room.id}/members`).set(auth(superToken)).send({ memberIds: [bobId] }).expect(201);
    await http().post(`/chat/rooms/${room.id}/messages`).set(auth(bobToken)).send({ body: 'bob here' }).expect(201);

    // Remove Bob → blocked again.
    await http().delete(`/chat/rooms/${room.id}/members/${bobId}`).set(auth(superToken)).expect(200);
    await http().post(`/chat/rooms/${room.id}/messages`).set(auth(bobToken)).send({ body: 'still here?' }).expect(403);
  });

  test('history pagination returns messages oldest-first with a forward cursor', async () => {
    const generalId = (await http().get('/chat/rooms').set(auth(aliceToken)).expect(200)).body.find((r: any) => r.key === 'GENERAL').id;
    for (let i = 0; i < 5; i++) {
      await http().post(`/chat/rooms/${generalId}/messages`).set(auth(aliceToken)).send({ body: `page ${run} #${i}` }).expect(201);
    }
    const page1 = (await http().get(`/chat/rooms/${generalId}/messages?limit=3`).set(auth(aliceToken)).expect(200)).body;
    expect(page1.messages).toHaveLength(3);
    const t0 = new Date(page1.messages[0].createdAt).getTime();
    const t1 = new Date(page1.messages[1].createdAt).getTime();
    expect(t0).toBeLessThanOrEqual(t1);
    expect(page1.hasMore).toBe(true);

    const page2 = (await http().get(`/chat/rooms/${generalId}/messages?limit=3&cursor=${page1.nextCursor}`).set(auth(aliceToken)).expect(200)).body;
    expect(page2.messages.length).toBeGreaterThan(0);
    expect(page2.messages[0].id).not.toBe(page1.messages[0].id);
  });

  test('realtime: an authenticated socket receives message:new; an anonymous socket is rejected', async () => {
    await expect(socket()).rejects.toBeTruthy();

    const bobSock = await socket(bobToken);
    const generalId = (await http().get('/chat/rooms').set(auth(bobToken)).expect(200)).body.find((r: any) => r.key === 'GENERAL').id;

    const delivered = new Promise<any>((resolve) => bobSock.on('message:new', resolve));
    await http().post(`/chat/rooms/${generalId}/messages`).set(auth(aliceToken)).send({ body: `realtime ${run}` }).expect(201);
    const evt = await Promise.race([
      delivered,
      new Promise((_, rej) => setTimeout(() => rej(new Error('no realtime delivery')), 4000)),
    ]);
    expect((evt as any).body).toBe(`realtime ${run}`);
  });

  test('unread summary aggregates across rooms', async () => {
    const summary = (await http().get('/chat/unread').set(auth(bobToken)).expect(200)).body;
    expect(typeof summary.total).toBe('number');
    expect(Array.isArray(summary.rooms)).toBe(true);
  });
});

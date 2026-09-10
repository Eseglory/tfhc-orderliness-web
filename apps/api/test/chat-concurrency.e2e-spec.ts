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
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) {
  throw new Error('Tests require a local tfhc_e2e database');
}
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');

describe('Messaging Multi-User Concurrency & Stress E2E Test', () => {
  let app: INestApplication;
  let db: PrismaService;
  let baseUrl: string;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  const NUM_USERS = 10;
  const users: Array<{
    id: string;
    memberId: string;
    email: string;
    token: string;
    socket?: Socket;
  }> = [];

  let generalRoomId: string;
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
    const tokens = app.get(AuthService);
    const pw = await argon2.hash('E2ePassword!123');

    // Create 10 concurrent test users with linked members
    for (let i = 0; i < NUM_USERS; i++) {
      const email = `stress-${run}-${i}@example.test`;
      const u = await db.user.create({
        data: {
          email,
          passwordHash: pw,
          role: 'MEMBER',
          member: {
            create: {
              memberCode: `STR-${run}-${i}`,
              firstName: `StressUser${i}`,
              lastName: `Tester`,
              phoneNumber: `0809000${String(i).padStart(4, '0')}`,
              roleInUnit: 'Member',
            },
          },
        },
        include: { member: true },
      });
      const token = tokens.generateToken(u.id, u.email, 'MEMBER', u.member!.id);
      users.push({ id: u.id, memberId: u.member!.id, email, token });
    }

    const rooms = (await http().get('/chat/rooms').set(auth(users[0].token)).expect(200)).body;
    generalRoomId = rooms.find((r: any) => r.key === 'GENERAL').id;
  }, 45000);

  afterAll(async () => {
    openSockets.forEach((s) => {
      s.removeAllListeners();
      s.disconnect();
      s.close();
    });
    await new Promise((r) => setTimeout(r, 100));
    if (db) {
      const memberIds = users.map((u) => u.memberId);
      await db.chatMessage.deleteMany({ where: { senderMemberId: { in: memberIds } } });
      await db.chatRoomMember.deleteMany({ where: { memberId: { in: memberIds } } });
      await db.member.deleteMany({ where: { id: { in: memberIds } } });
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
      await db.user.deleteMany({ where: { email: { contains: `stress-${run}-` } } });
    }
    if (app) await app.close();
  });

  const connectSocket = (token: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const s = io(`${baseUrl}/chat`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
        timeout: 4000,
      });
      openSockets.push(s);
      s.on('ready', () => resolve(s));
      s.on('connect_error', reject);
      setTimeout(() => reject(new Error('Socket timeout')), 4000);
    });

  test('concurrent message sending: 10 users send messages simultaneously without loss or duplication', async () => {
    // 1. Connect sockets for all 10 users
    for (const u of users) {
      u.socket = await connectSocket(u.token);
    }

    // Set up message collectors for user 0
    const receivedMessages: any[] = [];
    users[0].socket!.on('message:new', (msg) => {
      if (msg.roomId === generalRoomId) {
        receivedMessages.push(msg);
      }
    });

    // 2. Fire 10 concurrent messages via REST from all 10 users
    const sendPromises = users.map((u, idx) =>
      http()
        .post(`/chat/rooms/${generalRoomId}/messages`)
        .set(auth(u.token))
        .send({ body: `Concurrent message ${idx} from ${u.email}` }),
    );

    const responses = await Promise.all(sendPromises);
    responses.forEach((res) => expect(res.status).toBe(201));

    // Wait for fan-out to deliver to user 0
    await new Promise((r) => setTimeout(r, 500));

    // 3. Verify in database: exactly 10 messages created
    const dbMessages = await db.chatMessage.findMany({
      where: {
        roomId: generalRoomId,
        senderMemberId: { in: users.map((u) => u.memberId) },
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(dbMessages.length).toBe(NUM_USERS);

    // Verify all message IDs are unique (zero duplication)
    const uniqueIds = new Set(dbMessages.map((m) => m.id));
    expect(uniqueIds.size).toBe(NUM_USERS);

    // 4. Verify user 0 received the realtime events
    expect(receivedMessages.length).toBeGreaterThanOrEqual(NUM_USERS);
  });

  test('concurrent DMs: multiple distinct 1:1 direct conversations occur simultaneously in parallel', async () => {
    // Pair up users: (0, 1), (2, 3), (4, 5), (6, 7), (8, 9)
    const dmPairs = [
      [users[0], users[1]],
      [users[2], users[3]],
      [users[4], users[5]],
      [users[6], users[7]],
      [users[8], users[9]],
    ];

    const dmResults = await Promise.all(
      dmPairs.map(async ([uA, uB]) => {
        // A creates / opens DM with B
        const room = (await http().post(`/chat/direct/${uB.memberId}`).set(auth(uA.token)).expect(201)).body;

        // A sends message to DM
        const msgA = (
          await http()
            .post(`/chat/rooms/${room.id}/messages`)
            .set(auth(uA.token))
            .send({ body: `DM from ${uA.email} to ${uB.email}` })
            .expect(201)
        ).body;

        // B replies
        const msgB = (
          await http()
            .post(`/chat/rooms/${room.id}/messages`)
            .set(auth(uB.token))
            .send({ body: `Reply from ${uB.email}` })
            .expect(201)
        ).body;

        return { room, msgA, msgB };
      }),
    );

    expect(dmResults.length).toBe(5);

    // Verify unread counts for recipient B
    for (let i = 0; i < dmPairs.length; i++) {
      const [uA, uB] = dmPairs[i];
      const roomId = dmResults[i].room.id;
      const bRooms = (await http().get('/chat/rooms').set(auth(uB.token)).expect(200)).body;
      const bDm = bRooms.find((r: any) => r.id === roomId);
      expect(bDm).toBeTruthy();
    }
  });
});

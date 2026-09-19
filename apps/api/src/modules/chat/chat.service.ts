import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ChatMessageType, ChatRoom, ChatRoomType, MemberStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { isExecutiveRole, isDisciplinaryRole } from '../../common/event-visibility';
import {
  ChatViewer,
  directKey,
  viewerCanModerate,
  viewerIsExecutive,
  viewerIsDisciplinary,
  viewerManagesRooms,
} from './chat.util';
import { ChatBufferRepository } from './chat-buffer.repository';
import { ChatMigrationJob } from './chat-migration.job';

const MESSAGE_MAX = 4000;
const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;
const ACTIVE_MEMBER_STATUSES: MemberStatus[] = ['ACTIVE', 'NEW_MEMBER'];
const ACTIVE_MEMBER = { in: ACTIVE_MEMBER_STATUSES };

interface SenderRow {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  profilePhotoUrl: string | null;
}

function displayName(m: { firstName: string; lastName: string; preferredName?: string | null }): string {
  return (m.preferredName?.trim() || `${m.firstName} ${m.lastName}`).trim();
}

@Injectable()
export class ChatService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bufferRepo: ChatBufferRepository,
    private readonly migrationJob: ChatMigrationJob,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.ensureSystemRooms();
    } catch (error) {
      this.logger.error('Failed to ensure system chat rooms at boot', error as Error);
    }
  }

  // -------------------------------------------------------------------------
  // System rooms
  // -------------------------------------------------------------------------

  async ensureSystemRooms(): Promise<void> {
    const wanted: Array<{ key: string; name: string; description: string; type: ChatRoomType }> = [
      { key: 'GENERAL', name: 'General', description: 'Unit-wide conversation for every member.', type: 'GENERAL' },
      {
        key: 'EXECUTIVES',
        name: 'Executives',
        description: 'Private channel for unit executives and administrators.',
        type: 'EXECUTIVES',
      },
      {
        key: 'DISCIPLINARY',
        name: 'Disciplinary Committee',
        description: 'Confidential channel for Disciplinary Committee members, ethics reviews, and case discussions.',
        type: 'EXECUTIVES',
      },
    ];
    for (const r of wanted) {
      await this.prisma.chatRoom.upsert({
        where: { key: r.key },
        update: {},
        create: { key: r.key, name: r.name, description: r.description, type: r.type },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Access control
  // -------------------------------------------------------------------------

  private requireMember(viewer: ChatViewer): string {
    if (!viewer.memberId) {
      throw new ForbiddenException('Chat is available to member accounts only');
    }
    return viewer.memberId;
  }

  /** Resolve `roleInUnit` lazily when the gateway/JWT did not carry it. */
  private async withRoleInUnit(viewer: ChatViewer): Promise<ChatViewer> {
    if (viewer.roleInUnit !== undefined && viewer.roleInUnit !== null) return viewer;
    if (!viewer.memberId) return viewer;
    const member = await this.prisma.member.findUnique({
      where: { id: viewer.memberId },
      select: { roleInUnit: true },
    });
    return { ...viewer, roleInUnit: member?.roleInUnit ?? null };
  }

  private async canAccess(room: ChatRoom, viewer: ChatViewer): Promise<boolean> {
    if (!viewer.memberId) return false;
    if (!room.isActive && !viewerManagesRooms(viewer)) return false;
    if (room.type === 'GENERAL') return true;
    if (room.key === 'DISCIPLINARY') return viewerIsDisciplinary(await this.withRoleInUnit(viewer));
    if (room.type === 'EXECUTIVES') return viewerIsExecutive(await this.withRoleInUnit(viewer));
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_memberId: { roomId: room.id, memberId: viewer.memberId } },
    });
    if (membership && !membership.leftAt) return true;
    return viewerManagesRooms(viewer);
  }

  /** Load a room the viewer may see, or throw. */
  async loadRoom(roomId: string, viewer: ChatViewer): Promise<ChatRoom> {
    this.requireMember(viewer);
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Conversation not found');
    if (!(await this.canAccess(room, viewer))) {
      throw new ForbiddenException('You do not have access to this conversation');
    }
    return room;
  }

  /**
   * Ensure a `ChatRoomMember` row exists for this viewer so read state and
   * message fan-out are uniform across system and custom rooms.
   */
  private async ensureMembership(room: ChatRoom, viewer: ChatViewer) {
    const memberId = this.requireMember(viewer);
    return this.prisma.chatRoomMember.upsert({
      where: { roomId_memberId: { roomId: room.id, memberId } },
      update: { leftAt: null },
      create: { roomId: room.id, memberId, role: 'MEMBER' },
    });
  }

  private async executiveMemberIds(): Promise<string[]> {
    const members = await this.prisma.member.findMany({
      where: { status: ACTIVE_MEMBER },
      select: { id: true, roleInUnit: true, user: { select: { role: true } } },
    });
    return members
      .filter((m) => isExecutiveRole(m.roleInUnit) || (m.user && m.user.role !== 'MEMBER'))
      .map((m) => m.id);
  }

  private async disciplinaryMemberIds(): Promise<string[]> {
    const members = await this.prisma.member.findMany({
      where: { status: ACTIVE_MEMBER },
      select: {
        id: true,
        roleInUnit: true,
        user: {
          select: {
            role: true,
            accessRoles: {
              select: {
                role: {
                  select: {
                    key: true,
                    permissions: { select: { permission: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return members
      .filter((m) => {
        if (isDisciplinaryRole(m.roleInUnit)) return true;
        if (!m.user) return false;
        if (m.user.role !== 'MEMBER') return true;
        const roleKeys = m.user.accessRoles?.map((ar) => ar.role.key) ?? [];
        if (
          roleKeys.includes('DISCIPLINARY_COMMITTEE') ||
          roleKeys.includes('SUPER_ADMIN') ||
          roleKeys.includes('ADMINISTRATION')
        ) {
          return true;
        }
        const perms = m.user.accessRoles?.flatMap((ar) => ar.role.permissions.map((p) => p.permission)) ?? [];
        return perms.includes('*') || perms.includes('excuses.review') || perms.includes('flags.manage');
      })
      .map((m) => m.id);
  }

  /** Member ids that should receive fan-out for a room (used by the gateway). */
  async recipientMemberIds(room: ChatRoom): Promise<string[]> {
    if (room.type === 'GENERAL') {
      const rows = await this.prisma.member.findMany({ where: { status: ACTIVE_MEMBER }, select: { id: true } });
      return rows.map((r) => r.id);
    }
    if (room.key === 'DISCIPLINARY') return this.disciplinaryMemberIds();
    if (room.type === 'EXECUTIVES') return this.executiveMemberIds();
    const rows = await this.prisma.chatRoomMember.findMany({
      where: { roomId: room.id, leftAt: null },
      select: { memberId: true },
    });
    return rows.map((r) => r.memberId);
  }

  // -------------------------------------------------------------------------
  // Room listing
  // -------------------------------------------------------------------------

  async roomsForViewer(viewer: ChatViewer): Promise<ChatRoom[]> {
    const memberId = this.requireMember(viewer);
    const withRole = await this.withRoleInUnit(viewer);
    const system = await this.prisma.chatRoom.findMany({
      where: {
        OR: [
          { type: { in: ['GENERAL', 'EXECUTIVES'] } },
          { key: { in: ['GENERAL', 'EXECUTIVES', 'DISCIPLINARY'] } },
        ],
        isActive: true,
      },
    });
    const visibleSystem = system.filter((r) => {
      if (r.key === 'DISCIPLINARY') return viewerIsDisciplinary(withRole);
      if (r.type === 'GENERAL') return true;
      if (r.type === 'EXECUTIVES') return viewerIsExecutive(withRole);
      return false;
    });
    const joined = await this.prisma.chatRoom.findMany({
      where: {
        type: { in: ['CUSTOM', 'DIRECT'] },
        key: { notIn: ['GENERAL', 'EXECUTIVES', 'DISCIPLINARY'] },
        isActive: true,
        members: { some: { memberId, leftAt: null } },
      },
    });
    return [...visibleSystem, ...joined];
  }

  async roomIdsForViewer(viewer: ChatViewer): Promise<string[]> {
    return (await this.roomsForViewer(viewer)).map((r) => r.id);
  }

  async listRooms(viewer: ChatViewer) {
    if (!viewer.memberId) return [];
    const memberId = viewer.memberId;
    const rooms = await this.roomsForViewer(viewer);
    if (rooms.length === 0) return [];
    const roomIds = rooms.map((r) => r.id);

    // 1. Memberships of the viewer for all rooms (1 single batched query)
    const membershipRows = await this.prisma.chatRoomMember.findMany({
      where: { memberId, roomId: { in: roomIds } },
    });
    const membership = new Map(membershipRows.map((m) => [m.roomId, m]));

    // 2. Latest message per room in 1 single query using DISTINCT ON
    const latestMessages = await this.prisma.chatMessage.findMany({
      where: { roomId: { in: roomIds }, deletedAt: null },
      distinct: ['roomId'],
      orderBy: [{ roomId: 'asc' }, { createdAt: 'desc' }],
      include: { sender: { select: senderSelect } },
    });
    const lastMessageMap = new Map(latestMessages.map((m) => [m.roomId, m]));

    // Check if SQLite buffer has a more recent unmigrated message for any room
    for (const roomId of roomIds) {
      const bufferedLatest = this.bufferRepo.getLatestMessage(roomId);
      if (bufferedLatest) {
        const pgLatest = lastMessageMap.get(roomId);
        const bufTime = new Date(bufferedLatest.createdAt).getTime();
        const pgTime = pgLatest ? new Date(pgLatest.createdAt).getTime() : 0;
        if (bufTime > pgTime) {
          // If buffered is newer, look up sender details
          let senderInfo: SenderRow | null = null;
          if (bufferedLatest.senderMemberId) {
            const s = await this.prisma.member.findUnique({
              where: { id: bufferedLatest.senderMemberId },
              select: senderSelect,
            });
            if (s) senderInfo = s;
          }
          lastMessageMap.set(roomId, {
            id: bufferedLatest.id,
            clientOperationId: bufferedLatest.clientOperationId,
            roomId: bufferedLatest.roomId,
            senderMemberId: bufferedLatest.senderMemberId,
            type: bufferedLatest.type as ChatMessageType,
            body: bufferedLatest.body,
            attachmentUrl: bufferedLatest.attachmentUrl,
            attachmentMeta: bufferedLatest.attachmentMeta as Prisma.JsonValue,
            replyToId: bufferedLatest.replyToId,
            editedAt: bufferedLatest.editedAt ? new Date(bufferedLatest.editedAt) : null,
            deletedAt: bufferedLatest.deletedAt ? new Date(bufferedLatest.deletedAt) : null,
            createdAt: new Date(bufferedLatest.createdAt),
            sender: senderInfo,
          } as any);
        }
      }
    }

    // 3. Batched unread counts in 1 single SQL aggregation query
    const unreadMap = new Map<string, number>();
    try {
      const unreadRows = await this.prisma.$queryRaw<Array<{ roomId: string; count: bigint | number }>>`
        SELECT m."roomId", COUNT(m.id)::int AS "count"
        FROM "chat_messages" m
        LEFT JOIN "chat_room_members" crm
          ON crm."roomId" = m."roomId" AND crm."memberId" = ${memberId}
        WHERE m."roomId" = ANY(${roomIds}::text[])
          AND m."deletedAt" IS NULL
          AND (m."senderMemberId" IS NULL OR m."senderMemberId" != ${memberId})
          AND (crm."lastReadAt" IS NULL OR m."createdAt" > crm."lastReadAt")
        GROUP BY m."roomId";
      `;
      for (const row of unreadRows) {
        unreadMap.set(row.roomId, Number(row.count));
      }
    } catch {
      for (const room of rooms) {
        const lastReadAt = membership.get(room.id)?.lastReadAt;
        const cnt = await this.prisma.chatMessage.count({
          where: {
            roomId: room.id,
            deletedAt: null,
            senderMemberId: { not: memberId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        unreadMap.set(room.id, cnt);
      }
    }

    // 4. Batched member counts (1 batch query for custom/direct rooms)
    const generalCountPromise = rooms.some((r) => r.type === 'GENERAL')
      ? this.prisma.member.count({ where: { status: ACTIVE_MEMBER } })
      : Promise.resolve(0);
    const execCountPromise = rooms.some((r) => r.type === 'EXECUTIVES' && r.key !== 'DISCIPLINARY')
      ? this.executiveMemberIds().then((ids) => ids.length)
      : Promise.resolve(0);
    const disciplinaryCountPromise = rooms.some((r) => r.key === 'DISCIPLINARY')
      ? this.disciplinaryMemberIds().then((ids) => ids.length)
      : Promise.resolve(0);

    const customRoomIds = rooms
      .filter((r) => (r.type === 'CUSTOM' || r.type === 'DIRECT') && r.key !== 'DISCIPLINARY')
      .map((r) => r.id);
    const customCountsPromise =
      customRoomIds.length > 0
        ? this.prisma.chatRoomMember.groupBy({
            by: ['roomId'],
            where: { roomId: { in: customRoomIds }, leftAt: null },
            _count: { _all: true },
          })
        : Promise.resolve([]);

    const [generalCount, execCount, disciplinaryCount, customCounts] = await Promise.all([
      generalCountPromise,
      execCountPromise,
      disciplinaryCountPromise,
      customCountsPromise,
    ]);

    const memberCountMap = new Map<string, number>();
    for (const row of customCounts) {
      memberCountMap.set(row.roomId, row._count._all);
    }

    // 5. Batched other member details for DIRECT rooms (1 single query)
    const directRoomIds = rooms.filter((r) => r.type === 'DIRECT').map((r) => r.id);
    const directMembersMap = new Map<string, { memberId: string; name: string; photoUrl: string | null }>();
    if (directRoomIds.length > 0) {
      const otherMembers = await this.prisma.chatRoomMember.findMany({
        where: { roomId: { in: directRoomIds }, memberId: { not: memberId } },
        include: { member: { select: senderSelect } },
      });
      for (const om of otherMembers) {
        if (om.member) {
          directMembersMap.set(om.roomId, {
            memberId: om.member.id,
            name: displayName(om.member),
            photoUrl: om.member.profilePhotoUrl,
          });
        }
      }
    }

    const out = rooms.map((room) => {
      const mine = membership.get(room.id) ?? null;
      const lastReadAt = mine?.lastReadAt ?? null;
      const lastMessage = lastMessageMap.get(room.id) ?? null;
      const unreadCount = unreadMap.get(room.id) ?? 0;
      const memberCount =
        room.key === 'DISCIPLINARY'
          ? disciplinaryCount
          : room.type === 'GENERAL'
            ? generalCount
            : room.type === 'EXECUTIVES'
              ? execCount
              : memberCountMap.get(room.id) ?? 0;
      const direct = directMembersMap.get(room.id) ?? null;

      return {
        id: room.id,
        key: room.key,
        type: room.type,
        name: room.type === 'DIRECT' && direct ? direct.name : room.name,
        description: room.description,
        imageUrl: room.type === 'DIRECT' && direct ? direct.photoUrl : room.imageUrl,
        isActive: room.isActive,
        role: mine?.role ?? null,
        muted: mine?.mutedUntil ? mine.mutedUntil.getTime() > Date.now() : false,
        memberCount,
        unreadCount,
        lastReadAt,
        direct,
        lastMessage: lastMessage ? this.toMessageDto(lastMessage, viewer) : null,
      };
    });

    out.sort((a, b) => {
      const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });
    return out;
  }

  async getRoom(roomId: string, viewer: ChatViewer) {
    await this.loadRoom(roomId, viewer);
    const list = await this.listRooms(viewer);
    const found = list.find((r) => r.id === roomId);
    if (!found) throw new NotFoundException('Conversation not found');
    return found;
  }

  // -------------------------------------------------------------------------
  // Direct messages
  // -------------------------------------------------------------------------

  async getOrCreateDirect(viewer: ChatViewer, otherMemberId: string) {
    const memberId = this.requireMember(viewer);
    if (otherMemberId === memberId) throw new BadRequestException('You cannot message yourself');
    const other = await this.prisma.member.findUnique({
      where: { id: otherMemberId },
      select: { id: true, status: true, firstName: true, lastName: true, preferredName: true },
    });
    if (!other) throw new NotFoundException('Member not found');
    if (other.status === 'INACTIVE' || other.status === 'SUSPENDED') {
      throw new BadRequestException('This member is not reachable');
    }

    const key = directKey(memberId, otherMemberId);
    const existing = await this.prisma.chatRoom.findUnique({ where: { directKey: key } });
    let room = existing;
    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: {
          type: 'DIRECT',
          name: 'Direct message',
          directKey: key,
          createdById: viewer.userId,
          members: {
            create: [
              { memberId, role: 'MEMBER' },
              { memberId: otherMemberId, role: 'MEMBER' },
            ],
          },
        },
      });
    } else {
      // Re-open if either side had left.
      await this.prisma.chatRoomMember.updateMany({
        where: { roomId: room.id, memberId: { in: [memberId, otherMemberId] } },
        data: { leftAt: null },
      });
    }
    return this.getRoom(room.id, viewer);
  }

  // -------------------------------------------------------------------------
  // Messages & Real-time Buffer Query Merging
  // -------------------------------------------------------------------------

  async listMessages(
    roomId: string,
    viewer: ChatViewer,
    opts: { cursor?: string; limit?: number } = {},
  ) {
    const room = await this.loadRoom(roomId, viewer);
    await this.ensureMembership(room, viewer);
    const take = Math.min(Math.max(Number(opts.limit) || PAGE_DEFAULT, 1), PAGE_MAX);

    const rows = await this.prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: {
        sender: { select: senderSelect },
        replyTo: { include: { sender: { select: senderSelect } } },
      },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    // Check SQLite buffer for any recent messages in this room not yet in Postgres page
    const existingIds = new Set(page.map((m) => m.id));
    const bufferedRecent = this.bufferRepo.listRecentByRoom(roomId, 20);

    const pendingToAdd: any[] = [];
    for (const b of bufferedRecent) {
      if (!existingIds.has(b.id) && !opts.cursor) {
        let sender: SenderRow | null = null;
        if (b.senderMemberId) {
          sender = await this.prisma.member.findUnique({
            where: { id: b.senderMemberId },
            select: senderSelect,
          });
        }
        pendingToAdd.push({
          id: b.id,
          roomId: b.roomId,
          type: b.type as ChatMessageType,
          body: b.body,
          attachmentUrl: b.attachmentUrl,
          attachmentMeta: b.attachmentMeta,
          replyToId: b.replyToId,
          replyTo: null,
          editedAt: b.editedAt ? new Date(b.editedAt) : null,
          deletedAt: b.deletedAt ? new Date(b.deletedAt) : null,
          createdAt: new Date(b.createdAt),
          senderMemberId: b.senderMemberId,
          sender,
        });
      }
    }

    const combined = [...pendingToAdd, ...page];
    combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return {
      messages: combined.map((m) => this.toMessageDto(m, viewer)),
      nextCursor: hasMore ? page[0]?.id ?? null : null,
      hasMore,
    };
  }

  async postMessage(
    roomId: string,
    viewer: ChatViewer,
    dto: {
      body?: string;
      type?: string;
      attachmentUrl?: string;
      attachmentMeta?: unknown;
      replyToId?: string;
      operationId?: string;
    },
  ) {
    const room = await this.loadRoom(roomId, viewer);
    const membership = await this.ensureMembership(room, viewer);
    const memberId = membership.memberId;

    // 1. Idempotency check: SQLite buffer first (fastest), then Postgres
    if (dto.operationId) {
      const buffered = this.bufferRepo.findByClientOperationId(dto.operationId);
      if (buffered) {
        if (buffered.roomId !== roomId || buffered.senderMemberId !== memberId) {
          throw new ForbiddenException('Operation belongs to another sender');
        }
        const sender = await this.prisma.member.findUnique({
          where: { id: memberId },
          select: senderSelect,
        });
        return this.toMessageDto(
          {
            ...buffered,
            editedAt: buffered.editedAt ? new Date(buffered.editedAt) : null,
            deletedAt: buffered.deletedAt ? new Date(buffered.deletedAt) : null,
            createdAt: new Date(buffered.createdAt),
            sender,
            replyTo: null,
          } as any,
          viewer,
        );
      }

      const existing = await this.prisma.chatMessage.findUnique({
        where: { clientOperationId: dto.operationId },
        include: {
          sender: { select: senderSelect },
          replyTo: { include: { sender: { select: senderSelect } } },
        },
      });
      if (existing) {
        if (existing.roomId !== roomId || existing.senderMemberId !== memberId) {
          throw new ForbiddenException('Operation belongs to another sender');
        }
        return this.toMessageDto(existing, viewer);
      }
    }

    const body = typeof dto.body === 'string' ? dto.body.trim() : '';
    const attachmentUrl = typeof dto.attachmentUrl === 'string' ? dto.attachmentUrl : null;
    if (!body && !attachmentUrl) throw new BadRequestException('Message cannot be empty');
    if (body.length > MESSAGE_MAX) throw new BadRequestException(`Message exceeds ${MESSAGE_MAX} characters`);

    let type: ChatMessageType = 'TEXT';
    const requested = String(dto.type || '').toUpperCase();
    if (['TEXT', 'IMAGE', 'AUDIO'].includes(requested)) type = requested as ChatMessageType;
    else if (attachmentUrl) type = attachmentUrl.startsWith('data:audio') ? 'AUDIO' : 'IMAGE';

    if (dto.replyToId) {
      const parent = await this.prisma.chatMessage.findFirst({
        where: { id: dto.replyToId, roomId },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('The message being replied to is not in this conversation');
    }

    const messageId = randomUUID();
    const createdAt = new Date().toISOString();

    // 2. High-speed local persistence: write into SQLite realtime buffer immediately
    this.bufferRepo.saveMessage({
      id: messageId,
      clientOperationId: dto.operationId || null,
      roomId,
      senderMemberId: memberId,
      type,
      body: body || null,
      attachmentUrl,
      attachmentMeta:
        dto.attachmentMeta && typeof dto.attachmentMeta === 'object'
          ? (dto.attachmentMeta as Record<string, unknown>)
          : null,
      replyToId: dto.replyToId || null,
      createdAt,
    });

    // 3. Concurrently ensure PostgreSQL persistence
    const createArgs = {
      data: {
        id: messageId,
        ...(dto.operationId ? { clientOperationId: dto.operationId } : {}),
        roomId,
        senderMemberId: memberId,
        type,
        body: body || null,
        attachmentUrl,
        attachmentMeta:
          dto.attachmentMeta && typeof dto.attachmentMeta === 'object'
            ? (dto.attachmentMeta as Prisma.InputJsonValue)
            : Prisma.DbNull,
        replyToId: dto.replyToId || null,
      },
      include: {
        sender: { select: senderSelect },
        replyTo: { include: { sender: { select: senderSelect } } },
      },
    };

    let persisted: any = null;
    try {
      persisted = dto.operationId
        ? await this.prisma.chatMessage.upsert({
            where: { clientOperationId: dto.operationId },
            create: createArgs.data,
            update: {},
            include: createArgs.include,
          })
        : await this.prisma.chatMessage.create(createArgs);

      // Mark as migrated in SQLite since DB write succeeded directly
      this.bufferRepo.markMigrated(messageId, new Date().toISOString());
    } catch (error: any) {
      if (error?.code === 'P2002' && dto.operationId) {
        persisted = await this.prisma.chatMessage.findUnique({
          where: { clientOperationId: dto.operationId },
          include: createArgs.include,
        });
        if (persisted) {
          this.bufferRepo.markMigrated(messageId, new Date().toISOString());
        }
      } else {
        this.logger.warn(`Postgres synchronous write deferred to buffer: ${error?.message}`);
      }
    }

    // 4. Update the author's read receipt
    await this.prisma.chatRoomMember.update({
      where: { roomId_memberId: { roomId, memberId } },
      data: { lastReadAt: new Date(createdAt) },
    }).catch(() => undefined);

    if (persisted) {
      return this.toMessageDto(persisted, viewer);
    }

    // Fallback DTO from SQLite record if direct Postgres write is processing in background
    const sender = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: senderSelect,
    });

    return {
      id: messageId,
      roomId,
      type,
      body: body || null,
      attachmentUrl,
      attachmentMeta: dto.attachmentMeta ?? null,
      replyToId: dto.replyToId || null,
      replyTo: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(createdAt),
      sender: sender
        ? { memberId: sender.id, name: displayName(sender), photoUrl: sender.profilePhotoUrl }
        : null,
      mine: true,
    };
  }

  async editMessage(messageId: string, viewer: ChatViewer, body: string) {
    const memberId = this.requireMember(viewer);
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.senderMemberId !== memberId) throw new ForbiddenException('You can only edit your own messages');
    if (message.type !== 'TEXT') throw new BadRequestException('Only text messages can be edited');
    const trimmed = (body ?? '').trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > MESSAGE_MAX) throw new BadRequestException(`Message exceeds ${MESSAGE_MAX} characters`);

    const now = new Date();
    this.bufferRepo.updateMessage(messageId, trimmed, now.toISOString());

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: trimmed, editedAt: now },
      include: {
        sender: { select: senderSelect },
        replyTo: { include: { sender: { select: senderSelect } } },
      },
    });
    return this.toMessageDto(updated, viewer);
  }

  async deleteMessage(messageId: string, viewer: ChatViewer) {
    const memberId = this.requireMember(viewer);
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');

    const isOwner = message.senderMemberId === memberId;
    const canModerate = viewerCanModerate(viewer);
    if (!isOwner && !canModerate) throw new ForbiddenException('You cannot delete this message');

    const now = new Date();
    this.bufferRepo.deleteMessage(messageId, now.toISOString());

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: now, body: null, attachmentUrl: null, attachmentMeta: Prisma.DbNull },
      include: {
        sender: { select: senderSelect },
        replyTo: { include: { sender: { select: senderSelect } } },
      },
    });

    if (!isOwner) {
      await this.audit.record({
        actorUserId: viewer.userId,
        action: 'CHAT_MESSAGE_MODERATED',
        entity: 'ChatMessage',
        entityId: messageId,
        previousData: { roomId: message.roomId, senderMemberId: message.senderMemberId, body: message.body },
        newData: { deletedAt: updated.deletedAt },
      });
    }
    return this.toMessageDto(updated, viewer);
  }

  // -------------------------------------------------------------------------
  // Read state
  // -------------------------------------------------------------------------

  async markRead(roomId: string, viewer: ChatViewer, opts: { messageId?: string } = {}) {
    const room = await this.loadRoom(roomId, viewer);
    await this.ensureMembership(room, viewer);
    const memberId = this.requireMember(viewer);

    let readAt = new Date();
    if (opts.messageId) {
      const msg = await this.prisma.chatMessage.findFirst({
        where: { id: opts.messageId, roomId },
        select: { createdAt: true },
      });
      if (msg) readAt = msg.createdAt;
    }
    await this.prisma.chatRoomMember.update({
      where: { roomId_memberId: { roomId, memberId } },
      data: { lastReadAt: readAt },
    });
    return { roomId, lastReadAt: readAt };
  }

  async unreadSummary(viewer: ChatViewer) {
    if (!viewer.memberId) return { total: 0, rooms: [] };
    const rooms = await this.listRooms(viewer);
    const perRoom = rooms
      .filter((r) => r.unreadCount > 0)
      .map((r) => ({ roomId: r.id, unreadCount: r.unreadCount }));
    return { total: perRoom.reduce((s, r) => s + r.unreadCount, 0), rooms: perRoom };
  }

  // -------------------------------------------------------------------------
  // Contacts / presence support
  // -------------------------------------------------------------------------

  async contacts(viewer: ChatViewer) {
    if (!viewer.memberId) return [];
    const memberId = viewer.memberId;
    const members = await this.prisma.member.findMany({
      where: { status: ACTIVE_MEMBER, id: { not: memberId } },
      select: { ...senderSelect, roleInUnit: true, subTeam: { select: { name: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return members.map((m) => ({
      memberId: m.id,
      name: displayName(m),
      photoUrl: m.profilePhotoUrl,
      roleInUnit: m.roleInUnit,
      subTeam: m.subTeam?.name ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // Custom room management (requires `messages.manage_rooms`)
  // -------------------------------------------------------------------------

  async createRoom(
    viewer: ChatViewer,
    dto: { name?: string; description?: string; imageUrl?: string; memberIds?: string[] },
  ) {
    if (viewer.email?.toLowerCase() !== 'engreseglory@gmail.com') {
      throw new ForbiddenException('Only engreseglory@gmail.com is authorized to create chat rooms');
    }
    const creatorMemberId = this.requireMember(viewer);
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Room name is required');
    if (name.length > 80) throw new BadRequestException('Room name is too long');

    const requested = Array.isArray(dto.memberIds) ? [...new Set(dto.memberIds.filter(Boolean))] : [];
    const valid = requested.length
      ? await this.prisma.member.findMany({ where: { id: { in: requested } }, select: { id: true } })
      : [];
    const memberIds = new Set(valid.map((m) => m.id));
    memberIds.delete(creatorMemberId);

    const room = await this.prisma.chatRoom.create({
      data: {
        type: 'CUSTOM',
        name,
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        createdById: viewer.userId,
        members: {
          create: [
            { memberId: creatorMemberId, role: 'MODERATOR' },
            ...[...memberIds].map((id) => ({ memberId: id, role: 'MEMBER' as const })),
          ],
        },
      },
    });

    await this.systemMessage(room.id, `${this.viewerName(viewer)} created “${name}”`);
    await this.audit.record({
      actorUserId: viewer.userId,
      action: 'CHAT_ROOM_CREATED',
      entity: 'ChatRoom',
      entityId: room.id,
      newData: { name, memberIds: [...memberIds] },
    });
    return this.getRoom(room.id, viewer);
  }

  private async loadManageableRoom(roomId: string, viewer: ChatViewer): Promise<ChatRoom> {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.type !== 'CUSTOM') throw new BadRequestException('System and direct conversations cannot be modified');
    if (!viewerManagesRooms(viewer)) {
      const mod = await this.prisma.chatRoomMember.findUnique({
        where: { roomId_memberId: { roomId, memberId: this.requireMember(viewer) } },
      });
      if (!mod || mod.role !== 'MODERATOR' || mod.leftAt) {
        throw new ForbiddenException('You cannot manage this room');
      }
    }
    return room;
  }

  async updateRoom(
    viewer: ChatViewer,
    roomId: string,
    dto: { name?: string; description?: string; imageUrl?: string | null; isActive?: boolean },
  ) {
    const room = await this.loadManageableRoom(roomId, viewer);
    const data: Prisma.ChatRoomUpdateInput = {};
    if (typeof dto.name === 'string') {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Room name is required');
      data.name = name;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl?.trim() || null;
    if (typeof dto.isActive === 'boolean') data.isActive = dto.isActive;

    await this.prisma.chatRoom.update({ where: { id: roomId }, data });
    await this.audit.record({
      actorUserId: viewer.userId,
      action: 'CHAT_ROOM_UPDATED',
      entity: 'ChatRoom',
      entityId: roomId,
      previousData: { name: room.name, description: room.description, isActive: room.isActive },
      newData: data as Prisma.InputJsonValue,
    });
    return this.getRoom(roomId, viewer);
  }

  async listRoomMembers(roomId: string, viewer: ChatViewer) {
    const room = await this.loadRoom(roomId, viewer);
    if (room.type === 'GENERAL' || room.type === 'EXECUTIVES') {
      const ids = await this.recipientMemberIds(room);
      const members = await this.prisma.member.findMany({
        where: { id: { in: ids } },
        select: { ...senderSelect, roleInUnit: true },
        orderBy: [{ firstName: 'asc' }],
      });
      return members.map((m) => ({
        memberId: m.id,
        name: displayName(m),
        photoUrl: m.profilePhotoUrl,
        role: 'MEMBER',
        roleInUnit: m.roleInUnit,
        joinedAt: null,
      }));
    }
    const rows = await this.prisma.chatRoomMember.findMany({
      where: { roomId, leftAt: null },
      include: { member: { select: { ...senderSelect, roleInUnit: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((r) => ({
      memberId: r.member.id,
      name: displayName(r.member),
      photoUrl: r.member.profilePhotoUrl,
      role: r.role,
      roleInUnit: r.member.roleInUnit,
      joinedAt: r.joinedAt,
    }));
  }

  async addMembers(viewer: ChatViewer, roomId: string, memberIds: string[]) {
    await this.loadManageableRoom(roomId, viewer);
    const ids = [...new Set((memberIds ?? []).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('No members selected');
    const valid = await this.prisma.member.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, preferredName: true },
    });
    for (const m of valid) {
      await this.prisma.chatRoomMember.upsert({
        where: { roomId_memberId: { roomId, memberId: m.id } },
        update: { leftAt: null },
        create: { roomId, memberId: m.id, role: 'MEMBER' },
      });
    }
    await this.systemMessage(
      roomId,
      `${this.viewerName(viewer)} added ${valid.map((m) => displayName(m)).join(', ')}`,
    );
    await this.audit.record({
      actorUserId: viewer.userId,
      action: 'CHAT_ROOM_MEMBERS_ADDED',
      entity: 'ChatRoom',
      entityId: roomId,
      newData: { memberIds: valid.map((m) => m.id) },
    });
    return this.listRoomMembers(roomId, viewer);
  }

  async removeMember(viewer: ChatViewer, roomId: string, memberId: string) {
    await this.loadManageableRoom(roomId, viewer);
    const row = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_memberId: { roomId, memberId } },
      include: { member: { select: { firstName: true, lastName: true, preferredName: true } } },
    });
    if (!row || row.leftAt) throw new NotFoundException('That member is not in this room');
    await this.prisma.chatRoomMember.update({
      where: { roomId_memberId: { roomId, memberId } },
      data: { leftAt: new Date() },
    });
    await this.systemMessage(roomId, `${this.viewerName(viewer)} removed ${displayName(row.member)}`);
    await this.audit.record({
      actorUserId: viewer.userId,
      action: 'CHAT_ROOM_MEMBER_REMOVED',
      entity: 'ChatRoom',
      entityId: roomId,
      newData: { memberId },
    });
    return this.listRoomMembers(roomId, viewer);
  }

  async leaveRoom(viewer: ChatViewer, roomId: string) {
    const memberId = this.requireMember(viewer);
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.type !== 'CUSTOM') throw new BadRequestException('You cannot leave this conversation');
    const row = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_memberId: { roomId, memberId } },
    });
    if (!row || row.leftAt) throw new NotFoundException('You are not in this room');
    await this.prisma.chatRoomMember.update({
      where: { roomId_memberId: { roomId, memberId } },
      data: { leftAt: new Date() },
    });
    await this.systemMessage(roomId, `${this.viewerName(viewer)} left the room`);
    return { left: true };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  public getBufferStats() {
    return this.bufferRepo.getStats();
  }

  public triggerMigration() {
    return this.migrationJob.runMigration('manual');
  }

  private viewerName(viewer: ChatViewer): string {
    return [viewer.firstName, viewer.lastName].filter(Boolean).join(' ').trim() || 'A member';
  }

  private async systemMessage(roomId: string, body: string) {
    const messageId = randomUUID();
    const createdAt = new Date().toISOString();

    this.bufferRepo.saveMessage({
      id: messageId,
      roomId,
      senderMemberId: null,
      type: 'SYSTEM',
      body,
      createdAt,
    });

    await this.prisma.chatMessage.create({
      data: { id: messageId, roomId, type: 'SYSTEM', body },
    }).catch(() => undefined);
  }

  private toMessageDto(
    m: {
      id: string;
      roomId: string;
      type: ChatMessageType;
      body: string | null;
      attachmentUrl: string | null;
      attachmentMeta: Prisma.JsonValue;
      replyToId: string | null;
      editedAt: Date | null;
      deletedAt: Date | null;
      createdAt: Date;
      senderMemberId: string | null;
      sender?: SenderRow | null;
      replyTo?: ({ id: string; body: string | null; deletedAt: Date | null; sender?: SenderRow | null }) | null;
    },
    viewer: ChatViewer,
  ) {
    return {
      id: m.id,
      roomId: m.roomId,
      type: m.type,
      body: m.deletedAt ? null : m.body,
      attachmentUrl: m.deletedAt ? null : m.attachmentUrl,
      attachmentMeta: m.deletedAt ? null : m.attachmentMeta ?? null,
      replyToId: m.replyToId,
      replyTo:
        m.replyTo && !m.replyTo.deletedAt
          ? {
              id: m.replyTo.id,
              body: m.replyTo.body,
              senderName: m.replyTo.sender ? displayName(m.replyTo.sender) : null,
            }
          : null,
      editedAt: m.editedAt,
      deletedAt: m.deletedAt,
      createdAt: m.createdAt,
      sender: m.sender
        ? { memberId: m.sender.id, name: displayName(m.sender), photoUrl: m.sender.profilePhotoUrl }
        : null,
      mine: !!m.senderMemberId && m.senderMemberId === viewer.memberId,
    };
  }
}

const senderSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  profilePhotoUrl: true,
} satisfies Prisma.MemberSelect;

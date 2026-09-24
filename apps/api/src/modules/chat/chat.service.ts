import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
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
import { Interval } from '@nestjs/schedule';

export const CHAT_NOTIFICATIONS_COMMITTED = Symbol('chatNotificationsCommitted');

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

export function compactPhotoUrl(memberId: string | null | undefined, photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  if (photoUrl.startsWith('data:image') && memberId) {
    return `/members/${memberId}/photo`;
  }
  return photoUrl;
}

@Injectable()
export class ChatService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChatService.name);

  // High-performance hot-read caches
  private systemCountsCache: { general: number; exec: number; disciplinary: number; expiresAt: number } | null = null;
  private systemRoomsCache: { rooms: ChatRoom[]; expiresAt: number } | null = null;
  private roomMembersCache = new Map<string, { members: { memberId: string; lastReadAt: Date | string | null; lastDeliveredAt: Date | string | null }[]; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bufferRepo: ChatBufferRepository,
    private readonly migrationJob: ChatMigrationJob,
  ) {}

  private async getSystemCounts(): Promise<{ general: number; exec: number; disciplinary: number }> {
    const now = Date.now();
    if (this.systemCountsCache && this.systemCountsCache.expiresAt > now) {
      return this.systemCountsCache;
    }
    const [general, execIds, disciplinaryIds] = await Promise.all([
      this.prisma.member.count({ where: { status: ACTIVE_MEMBER } }),
      this.executiveMemberIds(),
      this.disciplinaryMemberIds(),
    ]);
    const counts = {
      general,
      exec: execIds.length,
      disciplinary: disciplinaryIds.length,
      expiresAt: now + 60_000,
    };
    this.systemCountsCache = counts;
    return counts;
  }

  private async getSystemRooms(): Promise<ChatRoom[]> {
    const now = Date.now();
    if (this.systemRoomsCache && this.systemRoomsCache.expiresAt > now) {
      return this.systemRoomsCache.rooms;
    }
    const system = await this.prisma.chatRoom.findMany({
      where: {
        OR: [
          { type: { in: ['GENERAL', 'EXECUTIVES'] } },
          { key: { in: ['GENERAL', 'EXECUTIVES', 'DISCIPLINARY'] } },
        ],
        isActive: true,
      },
    });
    this.systemRoomsCache = { rooms: system, expiresAt: now + 60_000 };
    return system;
  }

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

  /** Resolve `roleInUnit` and `subTeamName` lazily with 60s cache. */
  private viewerRoleCache = new Map<string, { viewer: ChatViewer; expiresAt: number }>();
  private async withRoleInUnit(viewer: ChatViewer): Promise<ChatViewer> {
    if (!viewer.memberId) return viewer;
    const now = Date.now();
    const cached = this.viewerRoleCache.get(viewer.memberId);
    if (cached && cached.expiresAt > now) {
      return { ...cached.viewer, ...viewer, roleInUnit: viewer.roleInUnit ?? cached.viewer.roleInUnit };
    }
    const member = await this.prisma.member.findUnique({
      where: { id: viewer.memberId },
      select: {
        roleInUnit: true,
        firstName: true,
        lastName: true,
        subTeam: { select: { name: true } },
        approvedMember: { select: { email: true } },
      },
    });
    const enriched: ChatViewer = {
      ...viewer,
      roleInUnit: viewer.roleInUnit ?? member?.roleInUnit ?? null,
      subTeamName: viewer.subTeamName ?? member?.subTeam?.name ?? null,
      email: viewer.email ?? member?.approvedMember?.email ?? null,
      firstName: viewer.firstName ?? member?.firstName ?? null,
      lastName: viewer.lastName ?? member?.lastName ?? null,
    };
    this.viewerRoleCache.set(viewer.memberId, { viewer: enriched, expiresAt: now + 60_000 });
    return enriched;
  }

  private accessCache = new Map<string, { allowed: boolean; expiresAt: number }>();
  private async canAccess(room: ChatRoom, viewer: ChatViewer): Promise<boolean> {
    if (!viewer.memberId) return false;
    if (!room.isActive && !viewerManagesRooms(viewer)) return false;
    if (room.type === 'GENERAL') return true;
    const withRole = await this.withRoleInUnit(viewer);
    if (room.key === 'DISCIPLINARY') return viewerIsDisciplinary(withRole);
    if (room.type === 'EXECUTIVES') return viewerIsExecutive(withRole);

    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_memberId: { roomId: room.id, memberId: viewer.memberId } },
    });
    const allowed = (membership && !membership.leftAt) || viewerManagesRooms(viewer);

    return allowed;
  }

  /** Load a room the viewer may see (cached 60s), or throw. */
  private roomCache = new Map<string, { room: ChatRoom; expiresAt: number }>();
  async loadRoom(roomId: string, viewer: ChatViewer): Promise<ChatRoom> {
    this.requireMember(viewer);
    const now = Date.now();
    let room: ChatRoom | null = null;
    const cached = this.roomCache.get(roomId);
    if (cached && cached.expiresAt > now) {
      room = cached.room;
    } else {
      room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
      if (room) this.roomCache.set(roomId, { room, expiresAt: now + 60_000 });
    }
    if (!room) throw new NotFoundException('Conversation not found');
    if (!(await this.canAccess(room, viewer))) {
      throw new ForbiddenException('You do not have access to this conversation');
    }
    return room;
  }

  /**
   * Ensure a `ChatRoomMember` row exists for this viewer once per session
   * so message fan-out and receipts are uniform without blocking on every message read.
   */
  private ensuredMemberships = new Set<string>();
  private async ensureMembership(room: ChatRoom, viewer: ChatViewer) {
    const memberId = this.requireMember(viewer);
    const key = `${room.id}:${memberId}`;
    if (this.ensuredMemberships.has(key)) {
      return;
    }
    return this.prisma.chatRoomMember.upsert({
      where: { roomId_memberId: { roomId: room.id, memberId } },
      update: { leftAt: null },
      create: { roomId: room.id, memberId, role: 'MEMBER' },
    }).then(result => { this.ensuredMemberships.add(key); return result; }).catch((err) => {
      this.ensuredMemberships.delete(key);
      throw err;
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
    const targetEmails = [
      'dotunakingbesote@gmail.com',
      'onojamonday123@gmail.com',
      'nicoleokafor0@gmail.com',
    ];

    const members = await this.prisma.member.findMany({
      where: { status: ACTIVE_MEMBER },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        roleInUnit: true,
        subTeam: { select: { name: true } },
        approvedMember: { select: { email: true } },
        user: {
          select: {
            email: true,
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
    const excludedEmails = [
      'koladeinfo@gmail.com',
      'engreseglory@gmail.com',
      'gloryeseosa@gmail.com',
    ];

    return members
      .filter((m) => {
        const email = (m.approvedMember?.email || m.user?.email || '').toLowerCase().trim();
        if (email && excludedEmails.includes(email)) return false;

        const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
        if (
          fullName.includes('kolade') ||
          (fullName.includes('glory') && !fullName.includes('dotun') && !fullName.includes('jacob') && !fullName.includes('nicole'))
        ) {
          return false;
        }

        if (isDisciplinaryRole(m.roleInUnit)) return true;
        if (m.subTeam?.name && /disciplinary/i.test(m.subTeam.name)) return true;
        if (email && targetEmails.includes(email)) return true;

        if (
          fullName.includes('dotun') ||
          fullName.includes('akingbesote') ||
          fullName.includes('onoja') ||
          fullName.includes('jacob') ||
          fullName.includes('nicol') ||
          fullName.includes('okafor')
        ) {
          return true;
        }

        if (!m.user) return false;
        const roleKeys = m.user.accessRoles?.map((ar) => ar.role.key) ?? [];
        if (roleKeys.includes('DISCIPLINARY_COMMITTEE')) {
          return true;
        }
        const perms = m.user.accessRoles?.flatMap((ar) => ar.role.permissions.map((p) => p.permission)) ?? [];
        return perms.includes('excuses.review') || perms.includes('flags.manage');
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
    const system = await this.getSystemRooms();
    const visibleSystem = system.filter((r) => {
      if (r.key === 'DISCIPLINARY') return viewerIsDisciplinary(withRole);
      if (r.type === 'GENERAL') return true;
      if (r.type === 'EXECUTIVES') return viewerIsExecutive(withRole);
      return false;
    });
    const joined = await this.prisma.chatRoom.findMany({
      where: {
        type: { in: ['CUSTOM', 'DIRECT'] },
        OR: [{ key: null }, { key: { notIn: ['GENERAL', 'EXECUTIVES', 'DISCIPLINARY'] } }],
        isActive: true,
        members: { some: { memberId, leftAt: null } },
      },
    });
    return [...visibleSystem, ...joined];
  }

  async roomIdsForViewer(viewer: ChatViewer): Promise<string[]> {
    return (await this.roomsForViewer(viewer)).map((r) => r.id);
  }

  private userRoomsListCache = new Map<string, { rooms: any[]; expiresAt: number }>();
  private customCountsCache = new Map<string, { count: number; expiresAt: number }>();

  public invalidateRoomCaches(roomId?: string, memberId?: string) {
    if (memberId) {
      this.userRoomsListCache.delete(memberId);
    } else {
      this.userRoomsListCache.clear();
    }
    if (roomId) {
      this.roomMembersCache.delete(roomId);
      this.roomCache.delete(roomId);
      this.customCountsCache.delete(roomId);
    }
  }

  async listRooms(viewer: ChatViewer) {
    if (!viewer.memberId) return [];
    const memberId = viewer.memberId;
    const now = Date.now();

    // Fast memory cache check (5s TTL)
    const cachedList = this.userRoomsListCache.get(memberId);
    if (cachedList && cachedList.expiresAt > now) {
      return cachedList.rooms;
    }

    const rooms = await this.roomsForViewer(viewer);
    if (rooms.length === 0) return [];
    const roomIds = rooms.map((r) => r.id);
    const hidden = await this.prisma.chatMessageHidden.findMany({ where: { memberId, message: { roomId: { in: roomIds } } }, select: { messageId: true } });
    const hiddenIds = hidden.map(m => m.messageId);

    // 1. Memberships of the viewer for all rooms (1 fast single batched query)
    const membershipRows = await this.prisma.chatRoomMember.findMany({
      where: { memberId, roomId: { in: roomIds } },
    });
    const membership = new Map(membershipRows.map((m) => [m.roomId, m]));

    // 2. Latest message per room - Hot SQLite store read (<0.05ms)
    // SQLite hot buffer is authoritative and seeded with all historical messages.
    const lastMessageMap = new Map<string, any>();
    for (const room of rooms) {
      const bufferedLast = this.bufferRepo.getLatestMessage(room.id, hiddenIds);
      if (bufferedLast) {
        const sender = bufferedLast.senderMemberId ? this.bufferRepo.getMemberProfile(bufferedLast.senderMemberId) : null;
        lastMessageMap.set(room.id, {
          id: bufferedLast.id,
          clientOperationId: bufferedLast.clientOperationId,
          roomId: bufferedLast.roomId,
          type: bufferedLast.type as ChatMessageType,
          body: bufferedLast.body,
          attachmentUrl: bufferedLast.attachmentUrl,
          attachmentMeta: bufferedLast.attachmentMeta,
          replyToId: bufferedLast.replyToId,
          editedAt: bufferedLast.editedAt,
          deletedAt: bufferedLast.deletedAt,
          createdAt: bufferedLast.createdAt,
          senderMemberId: bufferedLast.senderMemberId,
          sender: sender
            ? {
                id: sender.id,
                firstName: sender.firstName,
                lastName: sender.lastName,
                preferredName: sender.preferredName,
                profilePhotoUrl: sender.profilePhotoUrl,
              }
            : null,
        });
      }
    }

    // 3. Fast Unread counts computed directly from local SQLite buffer (<0.05ms)
    const unreadMap = new Map<string, number>();
    for (const room of rooms) {
      const mine = membership.get(room.id);
      const lastReadAt = mine?.lastReadAt ? new Date(mine.lastReadAt).toISOString() : null;
      const count = this.bufferRepo.countUnread(room.id, memberId, lastReadAt, hiddenIds);
      unreadMap.set(room.id, count);
    }

    // 4. Cached System member counts (general, exec, disciplinary) - 60s TTL
    const systemCounts = await this.getSystemCounts();

    // 5. Custom room counts with 60s cache
    const customRoomIds = rooms
      .filter((r) => (r.type === 'CUSTOM' || r.type === 'DIRECT') && r.key !== 'DISCIPLINARY')
      .map((r) => r.id);
    const memberCountMap = new Map<string, number>();
    const neededCountRoomIds: string[] = [];

    for (const rid of customRoomIds) {
      const cached = this.customCountsCache.get(rid);
      if (cached && cached.expiresAt > now) {
        memberCountMap.set(rid, cached.count);
      } else {
        neededCountRoomIds.push(rid);
      }
    }

    if (neededCountRoomIds.length > 0) {
      const customCounts = await this.prisma.chatRoomMember.groupBy({
        by: ['roomId'],
        where: { roomId: { in: neededCountRoomIds }, leftAt: null },
        _count: { _all: true },
      });
      for (const row of customCounts) {
        memberCountMap.set(row.roomId, row._count._all);
        this.customCountsCache.set(row.roomId, { count: row._count._all, expiresAt: now + 60_000 });
      }
    }

    // 6. Direct room other member details (lookup from in-memory profile cache)
    const directRoomIds = rooms.filter((r) => r.type === 'DIRECT').map((r) => r.id);
    const directMembersMap = new Map<string, { memberId: string; name: string; photoUrl: string | null }>();
    if (directRoomIds.length > 0) {
      const otherMembers = await this.prisma.chatRoomMember.findMany({
        where: { roomId: { in: directRoomIds }, memberId: { not: memberId } },
        select: { roomId: true, memberId: true, member: { select: senderSelect } },
      });
      this.bufferRepo.setMemberProfiles(otherMembers.map(m => m.member));
      for (const om of otherMembers) {
        const profile = this.bufferRepo.getMemberProfile(om.memberId);
        if (profile) {
          directMembersMap.set(om.roomId, {
            memberId: profile.id,
            name: displayName(profile),
            photoUrl: compactPhotoUrl(profile.id, profile.profilePhotoUrl),
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
          ? systemCounts.disciplinary
          : room.type === 'GENERAL'
            ? systemCounts.general
            : room.type === 'EXECUTIVES'
              ? systemCounts.exec
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
    this.userRoomsListCache.set(memberId, { rooms: out, expiresAt: now + 5000 });
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
    this.invalidateRoomCaches(room.id);
    return this.getRoom(room.id, viewer);
  }

  // -------------------------------------------------------------------------
  // Messages & Real-time Buffer Query Merging
  // -------------------------------------------------------------------------

  cacheRealtimeMessage(message: any) {
    if (!message?.id || !message.roomId || !message.createdAt || this.bufferRepo.findById(message.id)) return;
    this.bufferRepo.seedLegacyMessages([{
      id: message.id, clientOperationId: message.clientOperationId || message.clientId || null,
      roomId: message.roomId, senderMemberId: message.senderMemberId || message.sender?.memberId || null,
      type: message.type, body: message.body || null, attachmentUrl: message.attachmentUrl || null,
      attachmentMeta: message.attachmentMeta || null, replyToId: message.replyToId || null,
      createdAt: new Date(message.createdAt).toISOString(),
      editedAt: message.editedAt ? new Date(message.editedAt).toISOString() : null,
      deletedAt: message.deletedAt ? new Date(message.deletedAt).toISOString() : null,
    }]);
    this.invalidateRoomCaches(message.roomId);
  }

  async changes(roomId: string, viewer: ChatViewer, cursor: string) {
    await this.loadRoom(roomId, viewer);
    const parsed = /^(?:[a-f0-9-]{36}:)?(\d+)$/.exec(cursor);
    if (!parsed || !Number.isSafeInteger(Number(parsed[1]))) throw new BadRequestException('Invalid sync cursor');
    const delta = this.bufferRepo.changesAfter(roomId, cursor);
    const [hidden, reactions, receipts] = await Promise.all([
      this.prisma.chatMessageHidden.findMany({ where: { memberId: viewer.memberId, messageId: { in: delta.ids } }, select: { messageId: true } }),
      this.prisma.chatMessageReaction.findMany({ where: { messageId: { in: delta.ids } } }),
      this.prisma.chatRoomMember.findMany({ where: { roomId, leftAt: null }, select: { memberId: true, lastReadAt: true, lastDeliveredAt: true } }),
    ]);
    const removed = new Set(hidden.map(m => m.messageId));
    const records = delta.ids.map(id => this.bufferRepo.findById(id)).filter((m): m is NonNullable<typeof m> => !!m && !removed.has(m.id));
    const parents = new Map(records.filter(m => m.replyToId).map(m => [m.replyToId!, this.bufferRepo.findById(m.replyToId!)]));
    const profiles = [...new Set([...records, ...parents.values()].map(m => m?.senderMemberId).filter((id): id is string => !!id))];
    if (profiles.length) this.bufferRepo.setMemberProfiles(await this.prisma.member.findMany({ where: { id: { in: profiles } }, select: senderSelect }));
    const messages = records.map(m => this.toMessageDto({ ...m, type: m.type as ChatMessageType,
      sender: m.senderMemberId ? this.bufferRepo.getMemberProfile(m.senderMemberId) : null,
      reactions: reactions.filter(r => r.messageId === m.id),
      replyTo: m.replyToId && parents.get(m.replyToId) ? {
        ...parents.get(m.replyToId)!,
        sender: parents.get(m.replyToId)!.senderMemberId ? this.bufferRepo.getMemberProfile(parents.get(m.replyToId)!.senderMemberId!) : null,
      } : null,
    }, viewer, receipts));
    return { messages, receipts, removedIds: [...removed], nextSyncCursor: delta.nextCursor, hasMore: delta.hasMore };
  }

  async attachment(messageId: string, viewer: ChatViewer) {
    const message = this.bufferRepo.findById(messageId) || await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Attachment not found');
    await this.loadRoom(message.roomId, viewer);
    const hidden = await this.prisma.chatMessageHidden.findUnique({ where: { messageId_memberId: { messageId, memberId: viewer.memberId! } } });
    if (hidden) throw new NotFoundException('Attachment not found');
    const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(message.attachmentUrl || '');
    if (!match) throw new NotFoundException('Attachment not found');
    return { mime: match[1], bytes: Buffer.from(match[2], 'base64') };
  }

  async listMessages(
    roomId: string,
    viewer: ChatViewer,
    opts: { cursor?: string; limit?: number; search?: string } = {},
  ) {
    const room = await this.loadRoom(roomId, viewer);
    const syncCursor = this.bufferRepo.changeCursor();
    await this.ensureMembership(room, viewer);
    const take = Math.min(Math.max(Number(opts.limit) || PAGE_DEFAULT, 1), PAGE_MAX);

    // 1. Fetch room members (with 30s in-memory cache to avoid repeated DB round trips)
    const now = Date.now();
    let roomMembers: { memberId: string; lastReadAt: Date | string | null; lastDeliveredAt: Date | string | null }[] = [];
    const cachedMembers = this.roomMembersCache.get(roomId);
    if (cachedMembers && cachedMembers.expiresAt > now) {
      roomMembers = cachedMembers.members;
    } else {
      roomMembers = await this.prisma.chatRoomMember.findMany({
        where: { roomId, leftAt: null },
        select: { memberId: true, lastReadAt: true, lastDeliveredAt: true },
      });
      this.roomMembersCache.set(roomId, { members: roomMembers, expiresAt: now + 30_000 });
    }

    // A failed/incomplete initial import must not hide primary history behind a
    // handful of pending local messages. Fill only the requested primary page.
    if (!this.bufferRepo.getSyncCheckpoint()) {
      const anchor = opts.cursor ? this.bufferRepo.findById(opts.cursor) : null;
      const primary = await this.prisma.chatMessage.findMany({
        where: { roomId, ...(opts.search ? { body: { contains: opts.search.slice(0, 200), mode: 'insensitive' as const }, deletedAt: null } : {}),
          ...(anchor ? { OR: [{ createdAt: { lt: new Date(anchor.createdAt) } }, { createdAt: new Date(anchor.createdAt), id: { lt: anchor.id } }] } : {}),
        },
        ...(!anchor && opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
        take: take + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      for (const message of primary) this.cacheRealtimeMessage(message);
    }

    // 2. Query the local indexed page.
    let buffered = this.bufferRepo.listMessages(roomId, take, opts.cursor, opts.search);
    if (buffered.messages.length) {
      const visible: typeof buffered.messages = [];
      let page = buffered;
      for (;;) {
        const hidden = await this.prisma.chatMessageHidden.findMany({
          where: { memberId: viewer.memberId, messageId: { in: page.messages.map(m => m.id) } }, select: { messageId: true },
        });
        const hiddenIds = new Set(hidden.map(m => m.messageId));
        visible.push(...page.messages.filter(m => !hiddenIds.has(m.id)));
        if (visible.length > take || !page.hasMore) break;
        page = this.bufferRepo.listMessages(roomId, take, page.nextCursor || undefined, opts.search);
        if (!page.messages.length) break;
      }
      const hasMore = visible.length > take || page.hasMore;
      buffered = { messages: visible.slice(0, take), hasMore, nextCursor: hasMore ? visible[Math.min(take, visible.length) - 1]?.id || null : null };
    }
    if (buffered.messages.length > 0) {
      const reactions = await this.prisma.chatMessageReaction.findMany({ where: { messageId: { in: buffered.messages.map(m => m.id) } } });
      const missingProfiles = [...new Set(buffered.messages.map(m => m.senderMemberId).filter((id): id is string => !!id && !this.bufferRepo.getMemberProfile(id)))];
      if (missingProfiles.length) this.bufferRepo.setMemberProfiles(await this.prisma.member.findMany({ where: { id: { in: missingProfiles } }, select: senderSelect }));
      const dtos = buffered.messages.map((b) => {
        const sender = b.senderMemberId ? this.bufferRepo.getMemberProfile(b.senderMemberId) : null;
        let replyTo: any = null;
        if (b.replyToId) {
          const repMsg = this.bufferRepo.findById(b.replyToId);
          if (repMsg && !repMsg.deletedAt) {
            const repSender = repMsg.senderMemberId ? this.bufferRepo.getMemberProfile(repMsg.senderMemberId) : null;
            replyTo = {
              id: repMsg.id,
              body: repMsg.body,
              sender: repSender,
              deletedAt: repMsg.deletedAt,
            };
          }
        }
        return this.toMessageDto(
          {
            id: b.id,
            clientOperationId: b.clientOperationId,
            roomId: b.roomId,
            type: b.type as ChatMessageType,
            body: b.body,
            attachmentUrl: b.attachmentUrl,
            attachmentMeta: b.attachmentMeta,
            replyToId: b.replyToId,
            editedAt: b.editedAt,
            deletedAt: b.deletedAt,
            createdAt: b.createdAt,
            senderMemberId: b.senderMemberId,
            reactions: reactions.filter(r => r.messageId === b.id),
            sender: sender
              ? {
                  id: sender.id,
                  firstName: sender.firstName,
                  lastName: sender.lastName,
                  preferredName: sender.preferredName,
                  profilePhotoUrl: sender.profilePhotoUrl,
                }
              : null,
            replyTo,
          },
          viewer,
          roomMembers,
        );
      });

      return {
        syncCursor,
        messages: [...dtos].reverse(),
        nextCursor: buffered.nextCursor,
        hasMore: buffered.hasMore,
      };
    }

    // 3. Fallback to Primary DB if buffer is cold/empty
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        hiddenFor: { none: { memberId: viewer.memberId } },
        ...(opts.search ? { body: { contains: opts.search.slice(0, 200), mode: 'insensitive' as const }, deletedAt: null } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: {
        reactions: true,
        sender: { select: senderSelect },
        replyTo: { include: { sender: { select: senderSelect } } },
      },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    // Seed fetched rows into SQLite buffer so subsequent reads are instant (<1ms)
    try {
      this.bufferRepo.seedLegacyMessages(
        page.map((m) => ({
          id: m.id,
          clientOperationId: m.clientOperationId,
          roomId: m.roomId,
          senderMemberId: m.senderMemberId,
          type: String(m.type),
          body: m.body,
          attachmentUrl: m.attachmentUrl,
          attachmentMeta: (m.attachmentMeta as Record<string, unknown>) || null,
          replyToId: m.replyToId,
          editedAt: m.editedAt ? m.editedAt.toISOString() : null,
          deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
          createdAt: m.createdAt.toISOString(),
        })),
      );
    } catch {
      // Non-blocking
    }

    return {
      syncCursor,
      messages: [...page].reverse().map((m) => this.toMessageDto(m, viewer, roomMembers)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
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
    const started = Date.now();
    const room = await this.loadRoom(roomId, viewer);
    await this.ensureMembership(room, viewer);
    const memberId = viewer.memberId!;

    // Resolve retries against hot SQLite buffer or authoritative primary storage.
    if (dto.operationId) {
      const buffered = this.bufferRepo.findByClientOperationId(dto.operationId);
      if (buffered) {
        if (buffered.roomId !== roomId || buffered.senderMemberId !== memberId) {
          throw new ForbiddenException('Operation belongs to another sender');
        }
        await this.requirePrimaryPersistence(buffered.id);
        const sender = buffered.senderMemberId ? this.bufferRepo.getMemberProfile(buffered.senderMemberId) : null;
        return this.toMessageDto(
          {
            id: buffered.id,
            clientOperationId: buffered.clientOperationId,
            roomId: buffered.roomId,
            type: buffered.type as ChatMessageType,
            body: buffered.body,
            attachmentUrl: buffered.attachmentUrl,
            attachmentMeta: buffered.attachmentMeta,
            replyToId: buffered.replyToId,
            editedAt: buffered.editedAt,
            deletedAt: buffered.deletedAt,
            createdAt: buffered.createdAt,
            senderMemberId: buffered.senderMemberId,
            reactions: [],
            sender: sender ? { id: sender.id, firstName: sender.firstName, lastName: sender.lastName, preferredName: sender.preferredName, profilePhotoUrl: sender.profilePhotoUrl } : null,
          },
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
        await this.ensureNotificationWork(existing.id);
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
      const localParent = this.bufferRepo.findById(dto.replyToId);
      const parent = (localParent?.roomId === roomId ? localParent : null) || await this.prisma.chatMessage.findFirst({
        where: { id: dto.replyToId, roomId },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('The message being replied to is not in this conversation');
    }

    let messageId = randomUUID();
    let createdAt = new Date().toISOString();

    const isAllMentioned = /@(?:all|everyone)\b/i.test(body);
    const recipients = (await this.recipientMemberIds(room)).filter(id => id !== memberId);

    // Identify explicitly mentioned members
    const mentionedMemberIds = new Set<string>();
    if (isAllMentioned) {
      recipients.forEach(id => mentionedMemberIds.add(id));
    } else if (recipients.length > 0 && body.includes('@')) {
      const lowerBody = body.toLowerCase();
      for (const rId of recipients) {
        const rm = this.bufferRepo.getMemberProfile(rId);
        if (rm) {
          const fullName = `${rm.firstName} ${rm.lastName}`.trim().toLowerCase();
          const firstName = rm.firstName?.trim().toLowerCase();
          const preferred = rm.preferredName?.trim().toLowerCase();
          if (
            (fullName && lowerBody.includes(`@${fullName}`)) ||
            (firstName && (lowerBody.includes(`@${firstName} `) || lowerBody.endsWith(`@${firstName}`))) ||
            (preferred && (lowerBody.includes(`@${preferred} `) || lowerBody.endsWith(`@${preferred}`)))
          ) {
            mentionedMemberIds.add(rm.id);
          }
        }
      }
    }

    const baseMeta = dto.attachmentMeta && typeof dto.attachmentMeta === 'object' ? (dto.attachmentMeta as Record<string, unknown>) : {};
    const finalAttachmentMeta = (mentionedMemberIds.size > 0 || isAllMentioned)
      ? ({ ...baseMeta, mentions: Array.from(mentionedMemberIds), isAllMentioned } as Prisma.InputJsonValue)
      : (dto.attachmentMeta && typeof dto.attachmentMeta === 'object' ? (dto.attachmentMeta as Prisma.InputJsonValue) : Prisma.DbNull);

    // 1. FAST-PATH: Write immediately to SQLite buffer (local durable storage in WAL mode)
    try {
      const buffered = this.bufferRepo.saveMessage({
        id: messageId,
        clientOperationId: dto.operationId || null,
        roomId,
        senderMemberId: memberId,
        type,
        body: body || null,
        attachmentUrl,
        attachmentMeta: (finalAttachmentMeta as Record<string, unknown>) || null,
        replyToId: dto.replyToId || null,
        createdAt,
        notificationPayload: { roomId, memberId, viewer, recipients, mentionedMemberIds: [...mentionedMemberIds], isAllMentioned, room },
      });
      if (buffered.roomId !== roomId || buffered.senderMemberId !== memberId) throw new ForbiddenException('Operation belongs to another sender');
      if (buffered.id !== messageId) return this.postMessage(roomId, viewer, dto);
      messageId = buffered.id;
      createdAt = buffered.createdAt;
    } catch (err: any) {
      this.logger.error(`ChatBufferWriteFailed: ${err.message}`);
      throw err; // Never acknowledge an uncommitted message.
    }

    const createArgs = {
      data: {
        id: messageId,
        ...(dto.operationId ? { clientOperationId: dto.operationId } : {}),
        roomId,
        senderMemberId: memberId,
        type,
        body: body || null,
        attachmentUrl,
        attachmentMeta: finalAttachmentMeta,
        replyToId: dto.replyToId || null,
        createdAt: new Date(createdAt),
      },
    };

    // Render's free filesystem is ephemeral. Never let the device discard its
    // durable outbox until PostgreSQL confirms the message, including retries.
    await this.requirePrimaryPersistence(messageId);

    // Notifications remain outside the acknowledgement's critical path.
    void this.persistMessageAndNotifyAsync(
      messageId,
      roomId,
      memberId,
      viewer,
      dto,
      createArgs,
      recipients,
      mentionedMemberIds,
      isAllMentioned,
      room,
    );

    // 3. Construct instant outgoing message DTO
    const senderDto: SenderRow = {
      id: memberId,
      firstName: viewer.firstName || 'Member',
      lastName: viewer.lastName || '',
      preferredName: null,
      profilePhotoUrl: (viewer as any).profilePhotoUrl || null,
    };

    let replyToDto = null;
    if (dto.replyToId) {
      const parentMsg = this.bufferRepo.findById(dto.replyToId) ||
        await this.prisma.chatMessage.findUnique({
          where: { id: dto.replyToId },
          include: { sender: { select: senderSelect } },
        });
      if (parentMsg) {
        replyToDto = {
          id: parentMsg.id,
          body: parentMsg.body,
          deletedAt: (parentMsg as any).deletedAt ? new Date((parentMsg as any).deletedAt) : null,
          sender: (parentMsg as any).sender || null,
        };
      }
    }

    const messageResult = {
      id: messageId,
      clientOperationId: dto.operationId || null,
      roomId,
      type,
      body: body || null,
      attachmentUrl,
      attachmentMeta: finalAttachmentMeta,
      replyToId: dto.replyToId || null,
      replyTo: replyToDto,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(createdAt),
      senderMemberId: memberId,
      sender: senderDto,
      reactions: [],
      room: { members: [] },
    };

    this.invalidateRoomCaches(roomId);
    this.logger.debug(`ChatStoredFast message=${messageId} durationMs=${Date.now() - started}`);
    return Object.defineProperty(this.toMessageDto(messageResult, viewer), CHAT_NOTIFICATIONS_COMMITTED, { value: true });
  }

  private async requirePrimaryPersistence(messageId: string): Promise<void> {
    if (!await this.migrationJob.persistMessageAsync(messageId, true)) {
      throw new ServiceUnavailableException('Message is still queued. Durable storage is temporarily unavailable; retry with the same client message ID.');
    }
    await this.ensureNotificationWork(messageId);
  }

  private async ensureNotificationWork(messageId: string): Promise<void> {
    // This durable work marker survives loss of Render's local notification queue.
    // If either write fails the client retains its original operation for retry.
    await this.prisma.communicationDelivery.createMany({ data: [{
      idempotencyKey: `chat:${messageId}:notification-work`, channel: 'PUSH',
      recipient: messageId, providerRef: messageId, templateKey: 'CHAT_NOTIFICATION_WORK', status: 'PENDING',
    }], skipDuplicates: true });
  }

  async forwardMessage(messageId: string, targetRoomId: string, viewer: ChatViewer, operationId: string) {
    if (!operationId || operationId.length > 100) throw new BadRequestException('A client message ID is required');
    const source = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null, hiddenFor: { none: { memberId: this.requireMember(viewer) } } },
    });
    if (!source) throw new NotFoundException('Message not found');
    await this.loadRoom(source.roomId, viewer);
    if (source.type === 'SYSTEM') throw new BadRequestException('System messages cannot be forwarded');
    return this.postMessage(targetRoomId, viewer, {
      operationId, body: source.body || undefined, type: source.type,
      attachmentUrl: source.attachmentUrl || undefined,
      attachmentMeta: { ...(source.attachmentMeta as Record<string, unknown> || {}), forwarded: true },
    });
  }

  async react(messageId: string, viewer: ChatViewer, emoji: string, remove = false) {
    if (!['👍', '❤️', '😂', '😮', '😢', '🙏'].includes(emoji)) throw new BadRequestException('Unsupported reaction');
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    await this.loadRoom(message.roomId, viewer);
    const memberId = this.requireMember(viewer);
    if (remove) await this.prisma.chatMessageReaction.deleteMany({ where: { messageId, memberId, emoji } });
    else await this.prisma.chatMessageReaction.upsert({ where: { messageId_memberId_emoji: { messageId, memberId, emoji } }, create: { messageId, memberId, emoji }, update: {} });
    const rows = await this.prisma.chatMessageReaction.findMany({ where: { messageId } });
    this.bufferRepo.touchMessage(message.roomId, messageId);
    return { messageId, roomId: message.roomId, reactions: rows };
  }

  async hideMessage(messageId: string, viewer: ChatViewer) {
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    await this.loadRoom(message.roomId, viewer);
    const memberId = this.requireMember(viewer);
    await this.prisma.chatMessageHidden.upsert({ where: { messageId_memberId: { messageId, memberId } }, create: { messageId, memberId }, update: {} });
    this.bufferRepo.touchMessage(message.roomId, messageId);
    this.invalidateRoomCaches(message.roomId, memberId);
    return { hidden: true };
  }

  async markDelivered(roomId: string, viewer: ChatViewer, messageId: string) {
    const room = await this.loadRoom(roomId, viewer);
    await this.ensureMembership(room, viewer);
    let message = await this.prisma.chatMessage.findFirst({ where: { id: messageId, roomId } });
    if (!message) {
      const buffered = this.bufferRepo.findById(messageId);
      if (buffered && buffered.roomId === roomId) {
        message = { id: buffered.id, createdAt: new Date(buffered.createdAt) } as any;
      }
    }
    if (!message) throw new NotFoundException('Message not found');
    await this.prisma.chatRoomMember.updateMany({ where: { roomId, memberId: viewer.memberId,
      OR: [{ lastDeliveredAt: null }, { lastDeliveredAt: { lt: message.createdAt } }],
    }, data: { lastDeliveredAt: message.createdAt } });
    this.roomMembersCache.delete(roomId);
    return { roomId, memberId: viewer.memberId, lastDeliveredAt: message.createdAt };
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

    await this.loadRoom(message.roomId, viewer);
    const now = new Date();

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: trimmed, editedAt: now },
      include: {
        reactions: true,
        room: { select: { members: { where: { leftAt: null }, select: { memberId: true, lastReadAt: true, lastDeliveredAt: true } } } },
        sender: { select: senderSelect },
        replyTo: { include: { sender: { select: senderSelect } } },
      },
    });
    try {
      if (updated.deletedAt) this.bufferRepo.deleteMessage(messageId, updated.deletedAt.toISOString());
      else if (updated.editedAt) this.bufferRepo.updateMessage(messageId, updated.body || '', updated.editedAt.toISOString());
      this.bufferRepo.markMigrated(messageId, new Date().toISOString());
    } catch { this.logger.warn('ChatCacheUpdateFailed; primary update retained'); }
    return this.toMessageDto(updated, viewer);
  }

  async deleteMessage(messageId: string, viewer: ChatViewer) {
    const memberId = this.requireMember(viewer);
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');

    const isOwner = message.senderMemberId === memberId;
    const canModerate = viewerCanModerate(viewer);
    if (!isOwner && !canModerate) throw new ForbiddenException('You cannot delete this message');

    await this.loadRoom(message.roomId, viewer);
    const now = new Date();

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: now, body: null, attachmentUrl: null, attachmentMeta: Prisma.DbNull },
      include: {
        reactions: true,
        room: { select: { members: { where: { leftAt: null }, select: { memberId: true, lastReadAt: true, lastDeliveredAt: true } } } },
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
    try {
      if (updated.deletedAt) this.bufferRepo.deleteMessage(messageId, updated.deletedAt.toISOString());
      else if (updated.editedAt) this.bufferRepo.updateMessage(messageId, updated.body || '', updated.editedAt.toISOString());
      this.bufferRepo.markMigrated(messageId, new Date().toISOString());
    } catch { this.logger.warn('ChatCacheUpdateFailed; primary update retained'); }
    return this.toMessageDto(updated, viewer);
  }

  async recordCallEvent(
    roomId: string,
    callerMemberId: string,
    data: {
      callType: 'VOICE' | 'VIDEO';
      status: 'MISSED' | 'COMPLETED' | 'DECLINED';
      duration?: number;
      targetMemberId?: string;
    },
  ) {
    const isVideo = data.callType === 'VIDEO';
    let bodyText = '';
    if (data.status === 'MISSED') {
      bodyText = isVideo ? 'Missed video call' : 'Missed voice call';
    } else if (data.status === 'DECLINED') {
      bodyText = isVideo ? 'Declined video call' : 'Declined voice call';
    } else {
      const mins = Math.floor((data.duration || 0) / 60);
      const secs = (data.duration || 0) % 60;
      const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      bodyText = `${isVideo ? 'Video call' : 'Voice call'} • ${durStr}`;
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        senderMemberId: callerMemberId,
        type: 'SYSTEM',
        body: bodyText,
        attachmentMeta: {
          kind: 'CALL',
          callType: data.callType,
          status: data.status,
          duration: data.duration || 0,
          targetMemberId: data.targetMemberId,
        },
      },
      include: {
        sender: { select: senderSelect },
        reactions: true,
      },
    });

    const roomMembers = await this.prisma.chatRoomMember.findMany({
      where: { roomId, leftAt: null },
      select: { memberId: true, lastReadAt: true, lastDeliveredAt: true },
    });

    return this.toMessageDto(message, { memberId: callerMemberId } as any, roomMembers);
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
      let msg = await this.prisma.chatMessage.findFirst({
        where: { id: opts.messageId, roomId },
        select: { createdAt: true },
      });
      if (!msg) {
        const buffered = this.bufferRepo.findById(opts.messageId);
        if (buffered && buffered.roomId === roomId) {
          msg = { createdAt: new Date(buffered.createdAt) };
        }
      }
      if (!msg) throw new NotFoundException('Message not found in this conversation');
      readAt = msg.createdAt;
    }
    await this.prisma.chatRoomMember.updateMany({
      where: { roomId, memberId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: readAt } }] },
      data: { lastReadAt: readAt },
    });
    // Notification creation can lag message creation. Match the message watermark,
    // not notification time, so reading an older page never clears newer alerts.
    await this.prisma.$executeRaw`
      UPDATE "member_notifications" AS n SET status = 'READ', "readAt" = NOW()
      FROM "chat_messages" AS m
      WHERE n."memberId" = ${memberId} AND n.type = 'CHAT_MESSAGE'
        AND n.status = 'UNREAD' AND n.data->>'messageId' = m.id
        AND m."roomId" = ${roomId} AND m."createdAt" <= ${readAt}
    `;
    this.invalidateRoomCaches(roomId, memberId);
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
    if (!viewerManagesRooms(viewer)) {
      throw new ForbiddenException('You do not have permission to create chat rooms');
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
    this.invalidateRoomCaches(room.id);
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
    if (room.type === 'GENERAL' || room.type === 'EXECUTIVES' || room.key === 'DISCIPLINARY') {
      const ids = await this.recipientMemberIds(room);
      const members = await this.prisma.member.findMany({
        where: { id: { in: ids } },
        select: {
          ...senderSelect,
          roleInUnit: true,
          subTeam: { select: { name: true } },
          user: { select: { role: true } },
        },
        orderBy: [{ firstName: 'asc' }],
      });
      return members.map((m) => ({
        memberId: m.id,
        name: displayName(m),
        photoUrl: m.profilePhotoUrl,
        role: m.user?.role || 'MEMBER',
        roleInUnit: m.roleInUnit,
        subTeam: m.subTeam?.name || null,
        joinedAt: null,
      }));
    }
    const rows = await this.prisma.chatRoomMember.findMany({
      where: { roomId, leftAt: null },
      include: {
        member: {
          select: {
            ...senderSelect,
            roleInUnit: true,
            subTeam: { select: { name: true } },
            user: { select: { role: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((r) => ({
      memberId: r.member.id,
      name: displayName(r.member),
      photoUrl: r.member.profilePhotoUrl,
      role: r.role,
      roleInUnit: r.member.roleInUnit,
      subTeam: r.member.subTeam?.name || null,
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
    this.invalidateRoomCaches(roomId);
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
    this.invalidateRoomCaches(roomId);
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
    this.invalidateRoomCaches(roomId);
    await this.systemMessage(roomId, `${this.viewerName(viewer)} left the room`);
    return { left: true };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  public getBufferStats() {
    return {
      ...this.bufferRepo.getStats(),
      lastPrimaryImport: this.bufferRepo.getSyncCheckpoint(),
      lastRun: this.bufferRepo.getSyncSummary(),
      schedule: '00:00 and 12:00',
      timeZone: process.env.TFHC_TIMEZONE || 'Africa/Lagos',
      authority: 'PostgreSQL',
      acknowledgement: 'PostgreSQL commit and durable notification work before success',
    };
  }

  public triggerMigration() {
    return this.migrationJob.reconcileWithPrimaryDatabase('manual');
  }

  private viewerName(viewer: ChatViewer): string {
    return [viewer.firstName, viewer.lastName].filter(Boolean).join(' ').trim() || 'A member';
  }

  public async postSystemMessage(roomId: string, body: string) {
    return this.systemMessage(roomId, body);
  }

  private async systemMessage(roomId: string, body: string) {
    const message = await this.prisma.chatMessage.create({ data: { roomId, type: 'SYSTEM', body } });
    this.bufferRepo.seedLegacyMessages([{ ...message, attachmentMeta: message.attachmentMeta as Record<string, unknown> | null, createdAt: message.createdAt.toISOString(), editedAt: null, deletedAt: null }]);
    this.invalidateRoomCaches(roomId);
    return message;
  }

  private notificationsCommitted?: (memberIds: string[]) => void;

  onNotificationsCommitted(callback: (memberIds: string[]) => void) {
    this.notificationsCommitted = callback;
  }

  private notificationsDraining = false;

  @Interval(30000)
  async retryPendingNotifications() {
    if (process.env.DISABLE_SCHEDULED_JOBS === 'true' || this.notificationsDraining) return;
    this.notificationsDraining = true;
    try {
      let afterRowId = 0;
      while (true) {
        const batch = this.bufferRepo.pendingNotifications(50, afterRowId);
        if (!batch.length) break;
        for (const { rowId, messageId, payload: p } of batch) {
          afterRowId = rowId;
          const message = this.bufferRepo.findById(messageId);
          if (!message) continue;
          await this.persistMessageAndNotifyAsync(messageId, p.roomId, p.memberId, p.viewer, {},
            { data: { body: message.body, createdAt: message.createdAt } }, p.recipients,
            new Set(p.mentionedMemberIds), p.isAllMentioned, p.room);
        }
      }
      // Recover even when a restart replaced SQLite with an empty filesystem.
      let afterId: string | undefined;
      while (true) {
        const batch = await this.prisma.communicationDelivery.findMany({ where: {
          templateKey: 'CHAT_NOTIFICATION_WORK', status: 'PENDING', ...(afterId ? { id: { gt: afterId } } : {}),
        }, orderBy: { id: 'asc' }, take: 50 });
        if (!batch.length) break;
        for (const work of batch) {
          afterId = work.id;
          const message = await this.prisma.chatMessage.findUnique({ where: { id: work.recipient }, include: { room: true, sender: { select: senderSelect } } });
          if (!message || message.deletedAt || !message.senderMemberId) {
            await this.prisma.communicationDelivery.update({ where: { id: work.id }, data: { status: 'SENT' } });
            continue;
          }
          this.bufferRepo.seedLegacyMessages([{ ...message, attachmentMeta: message.attachmentMeta as Record<string, unknown> | null,
            createdAt: message.createdAt.toISOString(), editedAt: message.editedAt?.toISOString() || null, deletedAt: null }]);
          const recipients = (await this.recipientMemberIds(message.room)).filter(id => id !== message.senderMemberId);
          const metadata = message.attachmentMeta as { mentions?: string[]; isAllMentioned?: boolean } | null;
          await this.persistMessageAndNotifyAsync(message.id, message.roomId, message.senderMemberId,
            { userId: '', memberId: message.senderMemberId, role: 'MEMBER', permissions: [], firstName: message.sender?.firstName, lastName: message.sender?.lastName }, {},
            { data: { body: message.body, createdAt: message.createdAt } }, recipients,
            new Set(metadata?.mentions || []), !!metadata?.isAllMentioned, message.room);
        }
      }
    } finally { this.notificationsDraining = false; }
  }

  private async persistMessageAndNotifyAsync(
    messageId: string,
    roomId: string,
    memberId: string,
    viewer: ChatViewer,
    dto: { operationId?: string; replyToId?: string },
    createArgs: any,
    recipients: string[],
    mentionedMemberIds: Set<string>,
    isAllMentioned: boolean,
    room: ChatRoom,
  ) {
    try {
      // Message durability is independent of notification success.
      if (!await this.migrationJob.persistMessageAsync(messageId)) return;
      const created = await this.prisma.$transaction(async tx => {
        const saved = { id: messageId };

        const idempotencyKey = `chat:${saved.id}:notifications`;
        const claim = await tx.communicationDelivery.createMany({
          data: [{
            idempotencyKey,
            channel: 'PUSH',
            recipient: roomId,
            templateKey: 'CHAT_INAPP',
            status: 'SENT',
            attemptedAt: new Date(),
          }],
          skipDuplicates: true,
        });

        if (claim.count && recipients.length) {
          const receipts = await tx.chatRoomMember.findMany({ where: { roomId, memberId: { in: recipients } }, select: { memberId: true, lastReadAt: true } });
          const readMembers = new Set(receipts.filter(r => r.lastReadAt && r.lastReadAt >= new Date(createArgs.data.createdAt)).map(r => r.memberId));
          const senderName = this.viewerName(viewer);
          await tx.memberNotification.createMany({
            data: recipients.map(recipient => {
              const isMentioned = mentionedMemberIds.has(recipient);
              let notifTitle = room.type === 'DIRECT' ? senderName : room.name || 'General';
              let notifBody = (createArgs.data.body || 'New attachment').slice(0, 500);

              if (isAllMentioned) {
                notifTitle = `📢 @all in ${room.name || 'General'}`;
                notifBody = `${senderName}: ${createArgs.data.body || 'Announcement'}`.slice(0, 500);
              } else if (isMentioned) {
                notifTitle = `💬 ${senderName} mentioned you in ${room.name || 'General'}`;
                notifBody = createArgs.data.body ? createArgs.data.body.slice(0, 500) : 'Mentioned you in a message';
              }

              return {
                memberId: recipient,
                type: 'CHAT_MESSAGE',
                status: readMembers.has(recipient) ? 'READ' : 'UNREAD',
                readAt: readMembers.has(recipient) ? new Date() : null,
                title: notifTitle,
                body: notifBody,
                data: {
                  roomId,
                  messageId: saved.id,
                  url: `/member/chat?roomId=${roomId}`,
                  isMentioned,
                  isAllMentioned,
                },
              };
            }),
          });
        }

        // Update author's read receipt
        await tx.chatRoomMember.updateMany({
          where: { roomId, memberId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: new Date(createArgs.data.createdAt) } }] },
          data: { lastReadAt: new Date(createArgs.data.createdAt) },
        });
        await tx.communicationDelivery.updateMany({
          where: { idempotencyKey: `chat:${messageId}:notification-work` },
          data: { status: 'SENT', attemptedAt: new Date() },
        });
        return claim.count > 0;
      });

      this.bufferRepo.acknowledgeNotifications(messageId);
      if (created) this.notificationsCommitted?.(recipients);
      this.logger.debug(`ChatAsyncPersisted message=${messageId} roomId=${roomId}`);
    } catch (err: any) {
      this.logger.warn(`ChatAsyncPersistPending message=${messageId} err=${err?.message}`);
      // Durable notification outbox retains this work for automatic retry.
    }
  }

  private toMessageDto(
    m: {
      id: string;
      clientOperationId?: string | null;
      roomId: string;
      type: ChatMessageType;
      body: string | null;
      attachmentUrl: string | null;
      attachmentMeta: any;
      replyToId: string | null;
      editedAt: Date | string | null;
      deletedAt: Date | string | null;
      createdAt: Date | string;
      senderMemberId: string | null;
      reactions?: { emoji: string; memberId: string }[];
      room?: { members: { memberId: string; lastReadAt: Date | string | null; lastDeliveredAt: Date | string | null }[] };
      sender?: SenderRow | null;
      replyTo?: ({ id: string; body: string | null; deletedAt: Date | string | null; sender?: SenderRow | null }) | null;
    },
    viewer: ChatViewer,
    roomMembers?: { memberId: string; lastReadAt: Date | string | null; lastDeliveredAt: Date | string | null }[],
  ) {
    const members = roomMembers || m.room?.members || [];
    const createdTime = new Date(m.createdAt).getTime();
    return {
      id: m.id,
      clientId: m.clientOperationId || null,
      roomId: m.roomId,
      reactions: (m.reactions || []).reduce((counts, r) => ({ ...counts, [r.emoji]: (counts[r.emoji] || 0) + 1 }), {} as Record<string, number>),
      myReactions: (m.reactions || []).filter(r => r.memberId === viewer.memberId).map(r => r.emoji),
      readBy: members.filter(r => r.memberId !== m.senderMemberId && r.lastReadAt && new Date(r.lastReadAt).getTime() >= createdTime).length,
      deliveredTo: members.filter(r => r.memberId !== m.senderMemberId && r.lastDeliveredAt && new Date(r.lastDeliveredAt).getTime() >= createdTime).length,
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
      editedAt: m.editedAt ? new Date(m.editedAt) : null,
      deletedAt: m.deletedAt ? new Date(m.deletedAt) : null,
      createdAt: new Date(m.createdAt),
      sender: m.sender
        ? { memberId: m.sender.id, name: displayName(m.sender), photoUrl: compactPhotoUrl(m.sender.id, m.sender.profilePhotoUrl) }
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

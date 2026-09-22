import { randomUUID } from 'crypto';
import { Logger, Optional } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Namespace, Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';
import { ChatService, CHAT_NOTIFICATIONS_COMMITTED } from './chat.service';
import { ChatViewer } from './chat.util';
import { PushService } from '../push/push.service';

const corsOrigins = (process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean)) ?? [];

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: corsOrigins.length ? corsOrigins : true, credentials: false },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  /** The `/chat` namespace (what `@WebSocketServer()` resolves to for a
   *  namespaced gateway); normalised in {@link afterInit} so fan-out code does
   *  not care whether it was handed a Server or a Namespace. */
  private io!: Namespace | Server;

  /** memberId -> live socket ids */
  private readonly online = new Map<string, Set<string>>();

  /** socketId -> Set of roomIds where this socket actively signaled typing */
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly socketTypingRooms = new Map<string, Set<string>>();

  /** callId -> ActiveCall metadata for call history recording */
  private readonly activeCalls = new Map<
    string,
    {
      callId: string;
      roomId: string;
      callerMemberId: string;
      targetMemberId?: string;
      isVideo: boolean;
      startTime: number;
      connectedAt: number | null;
    }
  >();

  afterInit(server: Namespace | Server) {
    this.io = server ?? this.server;
  }

  /** socketId -> Socket map, tolerating both the Server and Namespace shapes. */
  private get liveSockets(): Map<string, Socket> {
    const anyIo = this.io as unknown as { sockets: unknown };
    if (anyIo.sockets instanceof Map) return anyIo.sockets as Map<string, Socket>;
    return (anyIo.sockets as { sockets: Map<string, Socket> }).sockets;
  }

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly chat: ChatService,
    @Optional() private readonly pushService?: PushService,
  ) {}

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  async handleConnection(socket: Socket) {
    try {
      const viewer = await this.authenticate(socket);
      if (!viewer || !viewer.memberId) {
        socket.emit('error', { message: 'Authentication required' });
        socket.disconnect(true);
        return;
      }
      socket.data.viewer = viewer;

      socket.join(`user:${viewer.userId}`);
      socket.join(`member:${viewer.memberId}`);
      const roomIds = await this.chat.roomIdsForViewer(viewer);
      roomIds.forEach((id) => socket.join(`room:${id}`));

      this.addOnline(viewer.memberId, socket.id);
      socket.emit('ready', { memberId: viewer.memberId, rooms: roomIds, online: this.onlineMemberIds() });
      socket.broadcast.emit('presence:update', { memberId: viewer.memberId, online: true });
    } catch (error) {
      this.logger.warn(`Rejected chat socket: ${(error as Error).message}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const viewer: ChatViewer | undefined = socket.data?.viewer;
    if (!viewer?.memberId) return;

    // Clear any active typing indicators for this socket
    for (const [key, timer] of this.typingTimers) if (key.startsWith(`${socket.id}:`)) { clearTimeout(timer); this.typingTimers.delete(key); }
    const typingRooms = this.socketTypingRooms.get(socket.id);
    if (typingRooms) {
      for (const roomId of typingRooms) {
        socket.to(`room:${roomId}`).emit('message:typing', {
          roomId,
          memberId: viewer.memberId,
          name: [viewer.firstName, viewer.lastName].filter(Boolean).join(' ').trim(),
          typing: false,
        });
      }
      this.socketTypingRooms.delete(socket.id);
    }

    const stillOnline = this.removeOnline(viewer.memberId, socket.id);
    if (!stillOnline) {
      socket.broadcast.emit('presence:update', { memberId: viewer.memberId, online: false });
    }
  }

  private async authenticate(socket: Socket): Promise<ChatViewer | null> {
    const raw =
      (socket.handshake.auth?.token as string | undefined) ||
      (typeof socket.handshake.headers.authorization === 'string'
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
        : undefined) ||
      (socket.handshake.query?.token as string | undefined);
    if (!raw) return null;

    let payload: { sub?: string; iat?: number; exp?: number };
    try {
      payload = await this.jwt.verifyAsync(raw, { secret: this.config.getOrThrow<string>('JWT_SECRET') });
    } catch {
      return null;
    }
    if (!payload.sub) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { member: { include: { approvedMember: true } } },
    });
    if (!user || !user.isActive) return null;
    if (user.passwordChangedAt && typeof payload.iat === 'number' && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) return null;
    if (user.role === 'MEMBER' && (user.googleSubject || user.passwordAuthEnabled) &&
        (user.member?.approvedMember?.status !== 'ACTIVE' || user.member.approvedMember.normalizedEmail !== user.email.toLowerCase())) return null;
    socket.data.expiresAt = payload.exp ? payload.exp * 1000 : 0;
    if (user.role === 'MEMBER' && (!user.member || user.member.status !== 'ACTIVE')) return null;
    if (user.role !== 'MEMBER' && !user.isActive) return null;

    const access =
      user.role === 'MEMBER'
        ? { permissions: [] as string[], isSuperAdmin: false }
        : await this.rbac.resolveAccess(user.id, user.role);

    return {
      userId: user.id,
      email: user.email,
      memberId: user.member?.id ?? null,
      role: user.role,
      roleInUnit: user.member?.roleInUnit ?? null,
      permissions: access.permissions,
      isSuperAdmin: access.isSuperAdmin,
      firstName: user.member?.firstName ?? null,
      lastName: user.member?.lastName ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Client events
  // -------------------------------------------------------------------------

  @SubscribeMessage('room:subscribe')
  async onSubscribe(@ConnectedSocket() socket: Socket, @MessageBody() data: { roomId?: string }) {
    const viewer = this.viewerOf(socket);
    if (!viewer || !data?.roomId) return { ok: false };
    try {
      await this.chat.loadRoom(data.roomId, viewer);
      socket.join(`room:${data.roomId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('message:send')
  async onMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      roomId?: string;
      body?: string;
      replyToId?: string;
      clientId?: string;
      attachmentUrl?: string;
      attachmentMeta?: unknown;
      type?: string;
    },
  ) {
    const viewer = this.viewerOf(socket);
    if (!viewer || !data?.roomId) return { ok: false, error: 'Not authorised' };
    try {
      const message = await this.chat.postMessage(data.roomId, viewer, {
        body: data.body,
        replyToId: data.replyToId,
        attachmentUrl: data.attachmentUrl,
        attachmentMeta: data.attachmentMeta,
        type: data.type,
        operationId: data.clientId,
      });

      // Clear typing indicator for sender
      this.recordTyping(socket.id, data.roomId, false);

      await this.fanOut(data.roomId, message);
      return { ok: true, message, clientId: data.clientId };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('message:typing')
  async onTyping(@ConnectedSocket() socket: Socket, @MessageBody() data: { roomId?: string; typing?: boolean }) {
    const viewer = this.viewerOf(socket);
    if (!viewer || !data?.roomId) return;
    try { await this.chat.loadRoom(data.roomId, viewer); } catch { return; }
    const isTyping = data.typing !== false;
    this.recordTyping(socket.id, data.roomId, isTyping);
    const timerKey = `${socket.id}:${data.roomId}`;
    clearTimeout(this.typingTimers.get(timerKey));
    this.typingTimers.delete(timerKey);
    if (isTyping) {
      const timer = setTimeout(() => {
        this.recordTyping(socket.id, data.roomId!, false);
        this.typingTimers.delete(timerKey);
        void this.emitRoomEvent(data.roomId!, 'message:typing', { roomId: data.roomId, memberId: viewer.memberId, typing: false }).catch(() => undefined);
      }, 5000);
      timer.unref();
      this.typingTimers.set(timerKey, timer);
    }

    await this.emitRoomEvent(data.roomId, 'message:typing', {
      roomId: data.roomId,
      memberId: viewer.memberId,
      name: [viewer.firstName, viewer.lastName].filter(Boolean).join(' ').trim(),
      typing: isTyping,
    });
  }

  @SubscribeMessage('message:read')
  async onRead(@ConnectedSocket() socket: Socket, @MessageBody() data: { roomId?: string; messageId?: string }) {
    const viewer = this.viewerOf(socket);
    if (!viewer || !data?.roomId) return { ok: false };
    try {
      const res = await this.chat.markRead(data.roomId, viewer, { messageId: data.messageId });
      await this.emitRoomEvent(data.roomId, 'message:read', {
        roomId: data.roomId,
        memberId: viewer.memberId,
        lastReadAt: res.lastReadAt,
      });
      this.io.to(`user:${viewer.userId}`).emit('unread:update');
      return { ok: true, ...res };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('message:delivered')
  async onDelivered(@ConnectedSocket() socket: Socket, @MessageBody() data: { roomId?: string; messageId?: string }) {
    const viewer = this.viewerOf(socket);
    if (!viewer || !data?.roomId || !data?.messageId) return { ok: false };
    try {
      const receipt = await this.chat.markDelivered(data.roomId, viewer, data.messageId);
      await this.emitRoomEvent(data.roomId, 'message:delivered', receipt);
      return { ok: true };
    } catch { return { ok: false }; }
  }

  @SubscribeMessage('presence:list')
  onPresence() {
    return { online: this.onlineMemberIds() };
  }

  // -------------------------------------------------------------------------
  // WebRTC Peer-to-Peer Signaling (Voice & Video Calls)
  // -------------------------------------------------------------------------

  @SubscribeMessage('call:initiate')
  async onCallInitiate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { roomId: string; targetMemberId?: string; isVideo?: boolean },
  ) {
    const viewer = this.viewerOf(socket);
    if (!viewer?.memberId) return { ok: false, error: 'Unauthorized' };

    const callId = randomUUID();
    const caller = {
      memberId: viewer.memberId,
      name: `${viewer.firstName ?? ''} ${viewer.lastName ?? ''}`.trim() || 'Member',
    };

    const callPayload = {
      callId,
      roomId: data.roomId,
      caller,
      isVideo: Boolean(data.isVideo),
    };

    this.activeCalls.set(callId, {
      callId,
      roomId: data.roomId,
      callerMemberId: viewer.memberId,
      targetMemberId: data.targetMemberId,
      isVideo: Boolean(data.isVideo),
      startTime: Date.now(),
      connectedAt: null,
    });

    if (data.targetMemberId) {
      const isTargetOnline = this.online.has(data.targetMemberId);
      if (isTargetOnline) {
        // Emit to member room as well as any tracked socket IDs
        this.io.to(`member:${data.targetMemberId}`).emit('call:incoming', callPayload);
        const targetSockets = this.online.get(data.targetMemberId);
        if (targetSockets) {
          for (const sid of targetSockets) {
            this.liveSockets.get(sid)?.emit('call:incoming', callPayload);
          }
        }
        return { ok: true, callId };
      }

      // If user is offline, record a missed call in the conversation timeline
      this.activeCalls.delete(callId);
      void this.recordAndBroadcastCall(data.roomId, viewer.memberId, {
        callType: data.isVideo ? 'VIDEO' : 'VOICE',
        status: 'MISSED',
        targetMemberId: data.targetMemberId,
      });
      return { ok: false, error: 'User is currently offline' };
    }

    // Room-wide call broadcast
    socket.to(`room:${data.roomId}`).emit('call:incoming', callPayload);
    return { ok: true, callId };
  }

  @SubscribeMessage('call:signal')
  onCallSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { targetMemberId?: string; roomId?: string; signal: any; callId: string },
  ) {
    const viewer = this.viewerOf(socket);
    if (!viewer?.memberId) return;

    if (data.signal?.type === 'ready' || data.signal?.type === 'answer') {
      const call = this.activeCalls.get(data.callId);
      if (call && !call.connectedAt) {
        call.connectedAt = Date.now();
      }
    }

    const signalPayload = {
      fromMemberId: viewer.memberId,
      signal: data.signal,
      callId: data.callId,
    };

    if (data.targetMemberId) {
      this.io.to(`member:${data.targetMemberId}`).emit('call:signal', signalPayload);
      const targetSockets = this.online.get(data.targetMemberId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          this.liveSockets.get(sid)?.emit('call:signal', signalPayload);
        }
      }
    } else if (data.roomId) {
      socket.to(`room:${data.roomId}`).emit('call:signal', signalPayload);
    }
  }

  @SubscribeMessage('call:reject')
  async onCallReject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; targetMemberId?: string; roomId?: string },
  ) {
    const viewer = this.viewerOf(socket);
    const call = this.activeCalls.get(data.callId);
    if (call) {
      this.activeCalls.delete(data.callId);
      void this.recordAndBroadcastCall(call.roomId, call.callerMemberId, {
        callType: call.isVideo ? 'VIDEO' : 'VOICE',
        status: 'DECLINED',
        targetMemberId: call.targetMemberId,
      });
    }

    const rejectPayload = {
      callId: data.callId,
      byMemberId: viewer?.memberId,
    };

    if (data.targetMemberId) {
      this.io.to(`member:${data.targetMemberId}`).emit('call:rejected', rejectPayload);
      const targetSockets = this.online.get(data.targetMemberId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          this.liveSockets.get(sid)?.emit('call:rejected', rejectPayload);
        }
      }
    } else if (data.roomId) {
      socket.to(`room:${data.roomId}`).emit('call:rejected', rejectPayload);
    }
  }

  @SubscribeMessage('call:end')
  async onCallEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { callId: string; targetMemberId?: string; roomId?: string },
  ) {
    const viewer = this.viewerOf(socket);
    const call = this.activeCalls.get(data.callId);
    if (call) {
      this.activeCalls.delete(data.callId);
      const duration = call.connectedAt ? Math.max(1, Math.round((Date.now() - call.connectedAt) / 1000)) : 0;
      const status = call.connectedAt ? 'COMPLETED' : 'MISSED';
      void this.recordAndBroadcastCall(call.roomId, call.callerMemberId, {
        callType: call.isVideo ? 'VIDEO' : 'VOICE',
        status,
        duration,
        targetMemberId: call.targetMemberId,
      });
    }

    const endPayload = {
      callId: data.callId,
      byMemberId: viewer?.memberId,
    };

    if (data.targetMemberId) {
      this.io.to(`member:${data.targetMemberId}`).emit('call:ended', endPayload);
      const targetSockets = this.online.get(data.targetMemberId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          this.liveSockets.get(sid)?.emit('call:ended', endPayload);
        }
      }
    } else if (data.roomId) {
      socket.to(`room:${data.roomId}`).emit('call:ended', endPayload);
    }
  }

  private async recordAndBroadcastCall(
    roomId: string,
    callerMemberId: string,
    data: {
      callType: 'VOICE' | 'VIDEO';
      status: 'MISSED' | 'COMPLETED' | 'DECLINED';
      duration?: number;
      targetMemberId?: string;
    },
  ) {
    try {
      const message = await this.chat.recordCallEvent(roomId, callerMemberId, data);
      await this.fanOut(roomId, message);
    } catch (err) {
      this.logger.error(`Failed to record call event for room ${roomId}: ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Fan-out — used by both the gateway and the REST controller
  // -------------------------------------------------------------------------

  async fanOut(roomId: string, message: unknown, createNotifications = true) {
    const started = Date.now();
    if (!this.io) return;
    // Resolve current membership before broadcasting; removed members may still
    // have an old socket room subscription.

    // Make sure members with a live socket who haven't joined this room yet
    // (e.g. a brand-new DM) still get it and a badge bump.
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) return;
    const recipientIds = await this.chat.recipientMemberIds(room);
    const dto = message as { id: string; body?: string; sender?: { memberId?: string; name?: string } };
    for (const memberId of recipientIds) {
      for (const socketId of this.online.get(memberId) ?? []) {
        const socket = this.liveSockets.get(socketId);
        if (!socket || !this.viewerOf(socket)) continue;
        void socket.join(`room:${roomId}`);
        socket.emit('message:new', { ...message as object, mine: dto.sender?.memberId === memberId });
        socket.emit('unread:update');
      }
    }

    // Persist once per recipient. Push uses the existing durable notification
    // dispatcher rather than a second, untracked fire-and-forget delivery.
    const notifications = recipientIds.filter(id => id !== dto.sender?.memberId).map(memberId => ({
      id: randomUUID(), memberId, type: 'CHAT_MESSAGE',
      title: room.type === 'DIRECT' ? dto.sender?.name || 'New message' : room.name || 'General',
      body: (dto.body || 'New attachment').slice(0, 500),
      data: { roomId, messageId: dto.id, url: `/member/chat?roomId=${roomId}` },
    }));
    if (createNotifications && notifications.length && !(message as { [CHAT_NOTIFICATIONS_COMMITTED]?: boolean })[CHAT_NOTIFICATIONS_COMMITTED]) {
      await this.prisma.$transaction(async tx => {
        const idempotencyKey = `chat:${dto.id}:notifications`;
        const claim = await tx.communicationDelivery.createMany({ data: [{
          idempotencyKey, channel: 'PUSH', recipient: roomId,
          templateKey: 'CHAT_INAPP', status: 'PENDING',
        }], skipDuplicates: true });
        if (!claim.count) return;
        await tx.memberNotification.createMany({ data: notifications });
        await tx.communicationDelivery.update({ where: { idempotencyKey }, data: {
          status: 'SENT', attemptedAt: new Date(),
        } });
      });
    }
    for (const memberId of recipientIds) {
      if (memberId === dto.sender?.memberId) continue;
      this.notifyMember(memberId);
      if (!this.isOnline(memberId)) {
        void this.pushService?.sendDirectPush({ memberId }, {
          title: room.type === 'DIRECT' ? dto.sender?.name || 'New message' : room.name || 'General',
          body: (dto.body || 'New message').slice(0, 150),
          url: `/member/chat?roomId=${roomId}`,
        });
      }
    }
    void this.pushService?.deliver();
    this.logger.log(`ChatFanOut message=${dto.id} recipients=${recipientIds.length} durationMs=${Date.now() - started}`);
  }

  notifyMember(memberId: string) {
    for (const socketId of this.online.get(memberId) ?? []) {
      const sock = this.liveSockets.get(socketId);
      sock?.emit('notification:new');
      sock?.emit('unread:update');
    }
  }

  async emitRoomEvent(roomId: string, event: string, payload: unknown) {
    if (!this.io) return;
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) return;
    for (const memberId of await this.chat.recipientMemberIds(room)) {
      for (const id of this.online.get(memberId) ?? []) {
        const socket = this.liveSockets.get(id);
        if (!socket || !this.viewerOf(socket)) continue;
        const message = payload as { sender?: { memberId?: string } };
        socket.emit(event, event === 'message:update' ? { ...payload as object, mine: message.sender?.memberId === memberId } : payload);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Presence & Typing bookkeeping
  // -------------------------------------------------------------------------

  private recordTyping(socketId: string, roomId: string, isTyping: boolean) {
    let set = this.socketTypingRooms.get(socketId);
    if (!set) {
      set = new Set<string>();
      this.socketTypingRooms.set(socketId, set);
    }
    if (isTyping) set.add(roomId);
    else set.delete(roomId);
  }

  private viewerOf(socket: Socket): ChatViewer | null {
    if (socket.data?.expiresAt && socket.data.expiresAt <= Date.now()) {
      socket.disconnect(true);
      return null;
    }
    return (socket.data?.viewer as ChatViewer) ?? null;
  }

  private addOnline(memberId: string, socketId: string) {
    const set = this.online.get(memberId) ?? new Set<string>();
    set.add(socketId);
    this.online.set(memberId, set);
  }

  private removeOnline(memberId: string, socketId: string): boolean {
    const set = this.online.get(memberId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.online.delete(memberId);
      return false;
    }
    return true;
  }

  private onlineMemberIds(): string[] {
    return [...this.online.keys()];
  }

  isOnline(memberId: string): boolean {
    return this.online.has(memberId);
  }
}

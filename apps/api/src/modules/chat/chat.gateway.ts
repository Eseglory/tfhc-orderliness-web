import { Logger } from '@nestjs/common';
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
import { ChatService } from './chat.service';
import { ChatViewer } from './chat.util';

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

    let payload: { sub?: string };
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
    if (!user) return null;
    if (user.role === 'MEMBER' && (!user.member || user.member.status !== 'ACTIVE')) return null;
    if (user.role !== 'MEMBER' && !user.isActive) return null;

    const access =
      user.role === 'MEMBER'
        ? { permissions: [] as string[], isSuperAdmin: false }
        : await this.rbac.resolveAccess(user.id, user.role);

    return {
      userId: user.id,
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
    data: { roomId?: string; body?: string; replyToId?: string; clientId?: string; attachmentUrl?: string; type?: string },
  ) {
    const viewer = this.viewerOf(socket);
    if (!viewer || !data?.roomId) return { ok: false, error: 'Not authorised' };
    try {
      const message = await this.chat.postMessage(data.roomId, viewer, {
        body: data.body,
        replyToId: data.replyToId,
        attachmentUrl: data.attachmentUrl,
        type: data.type,
      });
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
    socket.to(`room:${data.roomId}`).emit('message:typing', {
      roomId: data.roomId,
      memberId: viewer.memberId,
      name: [viewer.firstName, viewer.lastName].filter(Boolean).join(' ').trim(),
      typing: data.typing !== false,
    });
  }

  @SubscribeMessage('message:read')
  async onRead(@ConnectedSocket() socket: Socket, @MessageBody() data: { roomId?: string; messageId?: string }) {
    const viewer = this.viewerOf(socket);
    if (!viewer || !data?.roomId) return { ok: false };
    try {
      const res = await this.chat.markRead(data.roomId, viewer, { messageId: data.messageId });
      socket.to(`room:${data.roomId}`).emit('message:read', {
        roomId: data.roomId,
        memberId: viewer.memberId,
        lastReadAt: res.lastReadAt,
      });
      return { ok: true, ...res };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('presence:list')
  onPresence() {
    return { online: this.onlineMemberIds() };
  }

  // -------------------------------------------------------------------------
  // Fan-out — used by both the gateway and the REST controller
  // -------------------------------------------------------------------------

  async fanOut(roomId: string, message: unknown) {
    if (!this.io) return;
    this.io.to(`room:${roomId}`).emit('message:new', message);
    // Make sure members with a live socket who haven't joined this room yet
    // (e.g. a brand-new DM) still get it and a badge bump.
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) return;
    const recipientIds = await this.chat.recipientMemberIds(room);
    for (const memberId of recipientIds) {
      for (const socketId of this.online.get(memberId) ?? []) {
        const s = this.liveSockets.get(socketId);
        if (s && !s.rooms.has(`room:${roomId}`)) {
          s.join(`room:${roomId}`);
          s.emit('message:new', message);
        }
      }
    }
  }

  emitRoomEvent(roomId: string, event: string, payload: unknown) {
    this.io?.to(`room:${roomId}`).emit(event, payload);
  }

  // -------------------------------------------------------------------------
  // Presence bookkeeping
  // -------------------------------------------------------------------------

  private viewerOf(socket: Socket): ChatViewer | null {
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

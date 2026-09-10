'use client';
import React, { useState } from 'react';
import { Avatar } from './Avatar';
import { ChatMessage, formatMessageTime } from '../../lib/chat';

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SystemLine({ text }: { text: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-full bg-surface-container px-3 py-1 text-[11px] font-medium text-on-surface-variant">
        {text}
      </span>
    </div>
  );
}

export function MessageBubble({
  message,
  showSender,
  canModerate,
  onReply,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  showSender: boolean;
  canModerate: boolean;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const mine = message.mine;
  const deleted = !!message.deletedAt;
  const meta = message.attachmentMeta as { kind?: string; mime?: string; bytes?: number; name?: string; width?: number; height?: number } | null;

  return (
    <>
      {lightbox && message.attachmentUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              onClick={() => setLightbox(false)}
              className="absolute -top-10 right-0 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.attachmentUrl}
              alt={meta?.name || 'Full view'}
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      <div
        className={`group flex gap-2 ${mine ? 'flex-row-reverse' : 'flex-row'}`}
        onMouseLeave={() => setMenu(false)}
      >
        {!mine && (
          <div className="w-8 shrink-0">
            {showSender && <Avatar name={message.sender?.name ?? '?'} photoUrl={message.sender?.photoUrl} size={32} />}
          </div>
        )}

        <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
          {showSender && !mine && (
            <span className="mb-0.5 px-1 text-xs font-semibold text-on-surface-variant">{message.sender?.name}</span>
          )}

          <div
            className={`relative rounded-2xl px-3 py-2 text-sm shadow-sm ${
              deleted
                ? 'bg-surface-container text-on-surface-variant italic'
                : mine
                  ? 'bg-primary text-on-primary rounded-br-md'
                  : 'bg-surface-container-lowest text-on-surface rounded-bl-md border border-outline-variant/20'
            }`}
          >
            {message.replyTo && !deleted && (
              <div
                className={`mb-1 rounded-lg border-l-2 px-2 py-1 text-xs ${
                  mine ? 'border-on-primary/50 bg-on-primary/10' : 'border-primary/40 bg-surface-container'
                }`}
              >
                <span className="block font-semibold opacity-80">{message.replyTo.senderName ?? 'Message'}</span>
                <span className="block truncate opacity-70">{message.replyTo.body ?? 'Attachment'}</span>
              </div>
            )}

            {deleted ? (
              'This message was deleted'
            ) : (
              <>
                {message.type === 'IMAGE' && message.attachmentUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={message.attachmentUrl}
                    alt={meta?.name || 'Shared image'}
                    onClick={() => setLightbox(true)}
                    className="mb-1 max-h-72 cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-95"
                  />
                )}
                {message.type === 'AUDIO' && message.attachmentUrl && (
                  <audio controls src={message.attachmentUrl} className="mb-1 h-10 w-56 max-w-full" />
                )}
                {message.attachmentUrl && meta?.kind === 'document' && (
                  <a
                    href={message.attachmentUrl}
                    download={meta.name || 'document'}
                    className={`mb-1 flex items-center gap-2.5 rounded-xl p-2.5 transition-colors ${
                      mine
                        ? 'bg-on-primary/15 hover:bg-on-primary/25 text-on-primary'
                        : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[28px] shrink-0">
                      {meta.mime?.includes('pdf')
                        ? 'picture_as_pdf'
                        : meta.mime?.includes('sheet') || meta.mime?.includes('excel') || meta.mime?.includes('csv')
                          ? 'table_chart'
                          : 'description'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{meta.name || 'Document'}</p>
                      <p className="text-[10px] opacity-75">{formatBytes(meta.bytes)}</p>
                    </div>
                    <span className="material-symbols-outlined text-[18px] opacity-70">download</span>
                  </a>
                )}
                {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
              </>
            )}

            <span
              className={`mt-0.5 flex items-center gap-1 text-[10px] ${
                mine ? 'text-on-primary/70 justify-end' : 'text-on-surface-variant'
              }`}
            >
              {message.editedAt && !deleted && <span>edited</span>}
              {formatMessageTime(message.createdAt)}
              {message.pending ? (
                <span className="material-symbols-outlined text-[12px]">schedule</span>
              ) : mine ? (
                <span className="material-symbols-outlined text-[14px] text-on-primary/80">done_all</span>
              ) : null}
            </span>
          </div>
        </div>

        {!deleted && (
          <div className="relative flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => setMenu((v) => !v)}
              className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container"
              aria-label="Message actions"
            >
              <span className="material-symbols-outlined text-[18px]">more_vert</span>
            </button>
            {menu && (
              <div
                className={`absolute top-7 z-10 w-36 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1 text-sm shadow-lg ${
                  mine ? 'right-0' : 'left-0'
                }`}
              >
                <button
                  onClick={() => {
                    onReply(message);
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-on-surface hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined text-[16px]">reply</span> Reply
                </button>
                {mine && message.type === 'TEXT' && (
                  <button
                    onClick={() => {
                      onEdit(message);
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-on-surface hover:bg-surface-container"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                  </button>
                )}
                {(mine || canModerate) && (
                  <button
                    onClick={() => {
                      onDelete(message);
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-error hover:bg-error-container/40"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}


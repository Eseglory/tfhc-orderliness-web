'use client';
import React, { useState, useRef } from 'react';
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
      <span className="rounded-full bg-surface-container px-3 py-1 text-[11px] font-medium text-on-surface-variant shadow-xs">
        {text}
      </span>
    </div>
  );
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageBubble({
  message,
  showSender,
  canModerate,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onRetry,
  onHide,
  onForward,
  onJumpToReply,
}: {
  message: ChatMessage;
  showSender: boolean;
  canModerate: boolean;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onRetry?: (m: ChatMessage) => void;
  onHide?: (m: ChatMessage) => void;
  onForward?: (m: ChatMessage) => void;
  onJumpToReply?: (id: string) => void;
  onReact?: (m: ChatMessage, emoji: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [copied, setCopied] = useState(false);
  const reactions = message.reactions || {};
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mine = message.mine;
  const deleted = !!message.deletedAt;
  const meta = message.attachmentMeta as {
    kind?: string;
    mime?: string;
    bytes?: number;
    name?: string;
    width?: number;
    height?: number;
  } | null;

  const handleCopy = () => {
    if (message.body) {
      navigator.clipboard.writeText(message.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setMenu(false);
    }
  };

  const handleToggleReaction = (emoji: string) => {
    if (onReact) onReact(message, emoji);
  };

  const toggleAudioSpeed = () => {
    const nextSpeed = audioSpeed === 1 ? 1.5 : audioSpeed === 1.5 ? 2 : 1;
    setAudioSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  return (
    <>
      {lightbox && message.attachmentUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              onClick={() => setLightbox(false)}
              className="absolute -top-12 right-0 rounded-full bg-white/20 p-2 text-white hover:bg-white/40 transition-colors"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.attachmentUrl}
              alt={meta?.name || 'Full view'}
              className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      <div
        className={`group relative flex gap-2 mb-1 ${mine ? 'flex-row-reverse' : 'flex-row'}`}
        onMouseLeave={() => setMenu(false)}
      >
        {!mine && (
          <div className="w-8 shrink-0">
            {showSender && (
              <Avatar name={message.sender?.name ?? '?'} photoUrl={message.sender?.photoUrl} size={32} />
            )}
          </div>
        )}

        <div className={`flex max-w-[82%] sm:max-w-[70%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
          {showSender && !mine && (
            <span className="mb-1 px-1 text-xs font-bold text-primary dark:text-orange-400">
              {message.sender?.name}
            </span>
          )}

          {/* Message Box */}
          <div
            className={`relative rounded-2xl px-3.5 py-2.5 text-sm shadow-sm transition-all ${
              deleted
                ? 'bg-surface-container text-on-surface-variant italic'
                : mine
                  ? 'bg-gradient-to-br from-primary to-orange-600 text-white rounded-tr-xs'
                  : 'bg-surface-container-lowest text-on-surface rounded-tl-xs border border-outline-variant/20'
            }`}
          >
            {message.attachmentMeta?.forwarded === true && <p className="mb-1 text-xs italic opacity-75">Forwarded</p>}
            {/* Quoted Reply */}
            {message.replyTo && !deleted && (
              <button type="button" onClick={() => onJumpToReply?.(message.replyTo!.id)} aria-label="Go to original message"
                className={`mb-2 rounded-xl border-l-4 px-2.5 py-1.5 text-xs ${
                  mine
                    ? 'border-white/80 bg-black/15 text-white'
                    : 'border-primary bg-surface-container text-on-surface'
                }`}
              >
                <span className="block font-bold opacity-90">{message.replyTo.senderName ?? 'Reply'}</span>
                <span className="block truncate opacity-80">{message.replyTo.body ?? 'Attachment'}</span>
              </button>
            )}

            {deleted ? (
              <span className="flex items-center gap-1.5 text-xs text-on-surface-variant italic">
                <span className="material-symbols-outlined text-[16px]">block</span>
                This message was deleted
              </span>
            ) : (
              <>
                {/* Image Attachment */}
                {message.type === 'IMAGE' && message.attachmentUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={message.attachmentUrl}
                    alt={meta?.name || 'Shared image'}
                    loading="lazy"
                    decoding="async"
                    onClick={() => setLightbox(true)}
                    className="mb-1.5 max-h-72 w-full cursor-pointer rounded-xl object-cover transition-all hover:brightness-95 active:scale-[0.99]"
                  />
                )}

                {/* WhatsApp Style Audio / Voice Note Player */}
                {message.type === 'AUDIO' && message.attachmentUrl && (
                  <audio controls preload="metadata" src={message.attachmentUrl} className="mb-2 max-w-full" aria-label="Voice message playback" />
                )}

                {/* Document Attachment */}
                {message.attachmentUrl && meta?.kind === 'document' && (
                  <a
                    href={message.attachmentUrl}
                    download={meta.name || 'document'}
                    className={`mb-1.5 flex items-center gap-3 rounded-xl p-2.5 transition-all active:scale-[0.99] ${
                      mine
                        ? 'bg-black/15 hover:bg-black/25 text-white'
                        : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[24px]">
                        {meta.mime?.includes('pdf')
                          ? 'picture_as_pdf'
                          : meta.mime?.includes('sheet') || meta.mime?.includes('excel') || meta.mime?.includes('csv')
                            ? 'table_chart'
                            : 'description'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{meta.name || 'Document'}</p>
                      <p className="text-[10px] opacity-75">{formatBytes(meta.bytes)}</p>
                    </div>
                    <span className="material-symbols-outlined text-[20px] opacity-80">download</span>
                  </a>
                )}

                {/* Text Body */}
                {message.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>}
              </>
            )}

            {/* Time and WhatsApp Double Checkmarks */}
            <div
              className={`mt-1 flex items-center gap-1 text-[10px] ${
                mine ? 'text-white/80 justify-end' : 'text-on-surface-variant/80'
              }`}
            >
              {message.editedAt && !deleted && <span className="italic">edited</span>}
              <span>{formatMessageTime(message.createdAt)}</span>
              {message.failed ? <button onClick={() => onRetry?.(message)} className="underline" aria-label="Retry message">Failed · Retry</button> : message.pending ? (
                <span className="material-symbols-outlined text-[12px] opacity-75">schedule</span>
              ) : mine ? (
                /* WhatsApp double tick with cyan/teal read indicator */
                <span className="material-symbols-outlined text-[15px] font-bold" title={message.readBy ? `Read by ${message.readBy}` : message.deliveredTo ? `Delivered to ${message.deliveredTo}` : 'Sent'}>
                  {message.readBy || message.deliveredTo ? 'done_all' : 'done'}
                </span>
              ) : null}
            </div>
          </div>

          {/* Displayed Emoji Reactions Bar */}
          {Object.entries(reactions).filter(([, count]) => count > 0).length > 0 && (
            <div className={`flex items-center gap-1 mt-1 px-1 flex-wrap ${mine ? 'justify-end' : 'justify-start'}`}>
              {Object.entries(reactions)
                .filter(([, count]) => count > 0)
                .map(([em, count]) => (
                  <button
                    key={em}
                    onClick={() => handleToggleReaction(em)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-xs shadow-xs hover:scale-110 active:scale-95 transition-all"
                  >
                    <span>{em}</span>
                    <span className="text-[10px] font-bold text-on-surface-variant">{count}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Quick Hover Action Bar (WhatsApp Style Reaction Pill + More Menu) */}
        {!deleted && (
          <div
            className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-center ${
              mine ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            {/* Quick Emoji Reaction Pill */}
            <div className="flex items-center gap-0.5 p-1 rounded-full bg-surface-container-lowest border border-outline-variant/30 shadow-md">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleToggleReaction(emoji)}
                  className="p-1 rounded-full text-sm hover:scale-125 transition-transform"
                  title={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* More Menu Trigger */}
            <div className="relative">
              <button
                onClick={() => setMenu((v) => !v)}
                className="rounded-full p-1.5 text-on-surface-variant bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/30 shadow-xs transition-colors"
                aria-label="Message options"
              >
                <span className="material-symbols-outlined text-[18px]">more_vert</span>
              </button>

              {menu && (
                <div
                  className={`absolute top-8 z-30 w-40 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-1.5 text-xs shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
                    mine ? 'right-0' : 'left-0'
                  }`}
                >
                  <button
                    onClick={() => {
                      onReply(message);
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-on-surface hover:bg-surface-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">reply</span>
                    <span>Reply</span>
                  </button>

                  {message.body && (
                    <button
                      onClick={handleCopy}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-on-surface hover:bg-surface-container transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      <span>{copied ? 'Copied!' : 'Copy text'}</span>
                    </button>
                  )}

                  {mine && message.type === 'TEXT' && (
                    <button
                      onClick={() => {
                        onEdit(message);
                        setMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-on-surface hover:bg-surface-container transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      <span>Edit</span>
                    </button>
                  )}

                  {onForward && <button onClick={() => { onForward(message); setMenu(false); }} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2">Forward</button>}
                  {onHide && <button onClick={() => { onHide(message); setMenu(false); }} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2">Delete for me</button>}
                  {(mine || canModerate) && (
                    <button
                      onClick={() => {
                        onDelete(message);
                        setMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      <span>Delete for everyone</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

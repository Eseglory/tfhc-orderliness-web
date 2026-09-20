'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage } from '../../lib/chat';
import { useToast } from '../ui';
import { WhatsAppEmojiPicker } from './EmojiPicker';
import { compressImageIfNeeded } from '../../lib/image-compress';

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB Hard Limit
const SAFE_RECORDING_BYTE_LIMIT = 2.85 * 1024 * 1024; // 2.85 MB Auto-stop threshold for Opus/WebM container safety

export interface ComposerMember {
  memberId: string;
  name: string;
  photoUrl?: string | null;
  role?: string;
  roleInUnit?: string | null;
  subTeam?: string | null;
}

export interface MentionOption {
  type: 'all' | 'member';
  id: string;
  name: string;
  photoUrl?: string | null;
  badge?: string;
  description?: string;
}

export function Composer({
  disabled,
  draftKey,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSend,
  onAttach,
  onTyping,
  members = [],
  isGroup = true,
  currentMemberId,
}: {
  disabled?: boolean;
  draftKey?: string;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (text: string) => void | Promise<void>;
  onAttach: (file: File) => void | Promise<void>;
  onTyping: (typing: boolean) => void;
  members?: ComposerMember[];
  isGroup?: boolean;
  currentMemberId?: string;
}) {
  const { notify } = useToast();
  const [text, setText] = useState('');
  const submitting = useRef(false);
  const [recording, setRecording] = useState(false);
  const [voicePreview, setVoicePreview] = useState<File | null>(null);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // WhatsApp @ Mention state
  const [mentionState, setMentionState] = useState<{
    query: string;
    atIndex: number;
    cursor: number;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionBoxRef = useRef<HTMLDivElement>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const currentBytesRef = useRef(0);
  const autoStoppedRef = useRef(false);
  const typingRef = useRef(false);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const attachRef = useRef<HTMLDivElement>(null);

  const updateMentionState = (val: string, cursorIndex?: number) => {
    const el = textareaRef.current;
    const cursor = cursorIndex !== undefined ? cursorIndex : (el?.selectionStart ?? val.length);
    const textBeforeCursor = val.slice(0, cursor);

    // Look for @ preceded by start of line or whitespace, followed by up to 25 chars without newlines
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_\s]{0,25})$/);
    if (match) {
      const queryWithSpaces = match[1];
      if (queryWithSpaces.includes('\n') || queryWithSpaces.includes('  ')) {
        setMentionState(null);
        return;
      }
      const atIndex = textBeforeCursor.lastIndexOf('@');
      const query = queryWithSpaces.trim().toLowerCase();
      setMentionState({ query, atIndex, cursor });
      setMentionIndex(0);
    } else {
      setMentionState(null);
    }
  };

  const filteredMentions = useMemo<MentionOption[]>(() => {
    if (!mentionState) return [];
    const q = mentionState.query;
    const options: MentionOption[] = [];

    // 1. @all option (for group conversations)
    if (isGroup !== false && (q === '' || 'all'.startsWith(q) || 'everyone'.startsWith(q))) {
      options.push({
        type: 'all',
        id: 'ALL',
        name: 'all',
        badge: 'Notify Everyone',
        description: `Alert and tag all ${members?.length ? `${members.length} ` : ''}members in this room`,
      });
    }

    // 2. Member options
    if (members && members.length > 0) {
      const memberOptions: MentionOption[] = members
        .filter((m) => m.memberId !== currentMemberId)
        .filter((m) => {
          if (!q) return true;
          const nameMatch = m.name?.toLowerCase().includes(q);
          const subTeamMatch = m.subTeam?.toLowerCase().includes(q);
          const roleMatch = m.roleInUnit?.toLowerCase().includes(q);
          return nameMatch || subTeamMatch || roleMatch;
        })
        .map((m) => ({
          type: 'member' as const,
          id: m.memberId,
          name: m.name,
          photoUrl: m.photoUrl,
          badge: m.subTeam || m.roleInUnit || (m.role && m.role !== 'MEMBER' ? m.role : undefined),
          description: m.roleInUnit || m.subTeam || undefined,
        }));

      if (q) {
        memberOptions.sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(q) ? -1 : 1;
          const bStarts = b.name.toLowerCase().startsWith(q) ? -1 : 1;
          return aStarts - bStarts;
        });
      }

      options.push(...memberOptions);
    }

    return options;
  }, [mentionState, isGroup, members, currentMemberId]);

  const selectMention = (option: MentionOption) => {
    if (!mentionState) return;
    const replacement = option.type === 'all' ? '@all ' : `@${option.name} `;
    const before = text.slice(0, mentionState.atIndex);
    const after = text.slice(mentionState.cursor);
    const next = before + replacement + after;

    setText(next);
    handleChange(next);
    setMentionState(null);

    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        const newPos = before.length + replacement.length;
        el.focus();
        el.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  useEffect(() => {
    const clickOut = (ev: MouseEvent) => {
      if (mentionBoxRef.current && !mentionBoxRef.current.contains(ev.target as Node)) {
        setMentionState(null);
      }
    };
    if (mentionState) document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, [mentionState]);

  useEffect(() => {
    if (!voicePreview) { setVoiceUrl(''); return; }
    const url = URL.createObjectURL(voicePreview);
    setVoiceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [voicePreview]);
  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); }
    recorder?.stream.getTracks().forEach(track => track.stop());
  }, []);

  // Restore draft from localStorage
  useEffect(() => {
    if (draftKey && typeof window !== 'undefined' && !editing) {
      const saved = localStorage.getItem(`chat_draft:${draftKey}`);
      if (saved) {
        setText(saved);
        setTimeout(() => {
          const el = textareaRef.current;
          if (el) {
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
          }
        }, 0);
      }
    }
  }, [draftKey, editing]);

  useEffect(() => {
    if (editing) {
      setText(editing.body ?? '');
      textareaRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Click outside to close emoji / attach menus
  useEffect(() => {
    const clickOut = (ev: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(ev.target as Node)) {
        setShowEmojis(false);
      }
      if (attachRef.current && !attachRef.current.contains(ev.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showEmojis || showAttachMenu) document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, [showEmojis, showAttachMenu]);

  const emitTyping = (typing: boolean) => {
    if (typingRef.current === typing && (!typing || Date.now() - lastTypingSent.current < 2000)) return;
    lastTypingSent.current = Date.now();
    typingRef.current = typing;
    onTyping(typing);
  };

  const handleChange = (v: string) => {
    setText(v);
    updateMentionState(v);
    if (draftKey && typeof window !== 'undefined' && !editing) {
      if (v.trim()) {
        localStorage.setItem(`chat_draft:${draftKey}`, v);
      } else {
        localStorage.removeItem(`chat_draft:${draftKey}`);
      }
    }
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }
    if (v.trim()) {
      emitTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => emitTyping(false), 2500);
    } else {
      emitTyping(false);
    }
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || submitting.current) return;
    submitting.current = true;
    emitTyping(false);
    try {
      // onSend resolves after durable queueing; keep the draft until that succeeds.
      await onSend(value);
      if (!textareaRef.current || textareaRef.current.value.trim() === value) {
        setText('');
        if (draftKey) localStorage.removeItem(`chat_draft:${draftKey}`);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
    } catch {
      notify('Could not save this message. Your draft is still here.', 'error');
    } finally { submitting.current = false; }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart || text.length;
      const end = el.selectionEnd || text.length;
      const next = text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      handleChange(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      handleChange(text + emoji);
    }
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    setShowAttachMenu(false);
    if (!rawFile) return;
    const file = await compressImageIfNeeded(rawFile);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return notify('Maximum file size is 3 MB.', 'error');
    }
    void onAttach(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const preferredMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac',
      ];
      const selectedMime = preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

      const recorder = new MediaRecorder(
        stream,
        selectedMime
          ? {
              mimeType: selectedMime,
              audioBitsPerSecond: 24000, // 24 kbps Opus voice compression
            }
          : undefined,
      );

      chunksRef.current = [];
      currentBytesRef.current = 0;
      autoStoppedRef.current = false;
      setRecordedBytes(0);
      setElapsed(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          currentBytesRef.current += ev.data.size;
          setRecordedBytes(currentBytesRef.current);

          // Real-time 3 MB enforcement: Auto-stop near 2.85 MB threshold
          if (currentBytesRef.current >= SAFE_RECORDING_BYTE_LIMIT && !autoStoppedRef.current) {
            autoStoppedRef.current = true;
            notify('Maximum voice note size approaching 3 MB. Auto-stopping recording...', 'info');
            stopRecording(true);
          }
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm;codecs=opus',
        });
        setRecording(false);
        setElapsed(0);
        setRecordedBytes(0);

        if (blob.size > 500) {
          if (blob.size > MAX_ATTACHMENT_BYTES) {
            return notify('Voice note exceeds 3 MB limit.', 'error');
          }
          const isMp4 = (recorder.mimeType || '').includes('mp4') || (recorder.mimeType || '').includes('m4a');
          const isOgg = (recorder.mimeType || '').includes('ogg');
          const ext = isMp4 ? 'm4a' : isOgg ? 'ogg' : 'webm';
          setVoicePreview(new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type }));
        }
      };

      recorderRef.current = recorder;
      recorder.start(250); // Collect slices every 250ms for active size tracking
      setRecording(true);
    } catch {
      notify('Microphone access was denied or not available.', 'error');
    }
  };

  const stopRecording = (send: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (!send) recorder.onstop = () => recorder.stream.getTracks().forEach((t) => t.stop());
    recorder.stop();
    setRecording(false);
    setElapsed(0);
    setRecordedBytes(0);
  };

  if (disabled) {
    return (
      <div className="border-t border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-center text-xs text-on-surface-variant font-medium">
        This conversation is closed.
      </div>
    );
  }

  const recordedMb = (recordedBytes / (1024 * 1024)).toFixed(2);
  const sizePercentage = Math.min(100, Math.round((recordedBytes / MAX_ATTACHMENT_BYTES) * 100));

  return (
    <div className="relative border-t border-outline-variant/20 bg-surface-container-lowest p-2.5 sm:px-4 sm:py-3 transition-colors">
      {/* Hidden File Inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={handleFilePicked}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
        hidden
        onChange={handleFilePicked}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={handleFilePicked}
      />

      {/* Categorized WhatsApp Emoji Picker */}
      {showEmojis && (
        <div ref={emojiRef} className="absolute bottom-16 left-2 sm:left-4 z-30">
          <WhatsAppEmojiPicker
            onSelect={insertEmoji}
            onClose={() => setShowEmojis(false)}
          />
        </div>
      )}

      {/* WhatsApp Multi-Action Attachment Menu */}
      {showAttachMenu && (
        <div
          ref={attachRef}
          className="absolute bottom-16 left-12 sm:left-14 z-30 w-52 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-2 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 space-y-1"
        >
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">image</span>
            </div>
            <div>
              <p className="text-xs font-bold text-on-surface">Photos &amp; Media</p>
              <p className="text-[10px] text-on-surface-variant">Max 2 MB</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">description</span>
            </div>
            <div>
              <p className="text-xs font-bold text-on-surface">Document</p>
              <p className="text-[10px] text-on-surface-variant">PDF, DOC, XLS (Max 2 MB)</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-orange-500/10 text-orange-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">headphones</span>
            </div>
            <div>
              <p className="text-xs font-bold text-on-surface">Audio File</p>
              <p className="text-[10px] text-on-surface-variant">MP3, M4A, WebM (Max 2 MB)</p>
            </div>
          </button>
        </div>
      )}

      {/* Reply or Edit Context Banner */}
      {(replyTo || editing) && (
        <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs animate-in slide-in-from-bottom-2">
          <span className="material-symbols-outlined text-[18px] text-primary">
            {editing ? 'edit' : 'reply'}
          </span>
          <div className="min-w-0 flex-1">
            <span className="font-bold text-primary">
              {editing ? 'Editing message' : `Replying to ${replyTo?.sender?.name ?? 'Message'}`}
            </span>
            <p className="truncate text-[11px] text-on-surface-variant">
              {editing ? editing.body : replyTo?.body || 'Attachment'}
            </p>
          </div>
          <button
            onClick={editing ? onCancelEdit : onCancelReply}
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high transition-colors"
            aria-label="Cancel"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {voicePreview && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border p-3" aria-label="Voice message preview">
        <audio controls preload="metadata" src={voiceUrl} className="max-w-full" />
        <button type="button" onClick={() => setVoicePreview(null)} className="px-3 py-2">Cancel</button>
        <button type="button" onClick={async () => { try { await onAttach(voicePreview); setVoicePreview(null); } catch { notify('Voice message retained. Try sending again.', 'error'); } }} className="rounded-lg bg-primary px-3 py-2 text-white">Send voice message</button>
      </div>}
      {/* Voice Recorder Active Mode with Real-Time Size Tracking & Waveform */}
      {/* WhatsApp-Style Interactive @ Mention Dropdown Popover */}
      {mentionState && filteredMentions.length > 0 && (
        <div
          ref={mentionBoxRef}
          className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-4 mb-2 z-50 max-h-60 sm:max-h-72 overflow-y-auto rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl backdrop-blur-xl p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
          role="listbox"
          aria-label="Member mentions"
        >
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center justify-between border-b border-outline-variant/20 mb-1">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-primary">alternate_email</span>
              Mention Members
            </span>
            <span className="text-[10px] lowercase font-normal opacity-70">
              {filteredMentions.length} available · ↑↓ / Enter
            </span>
          </div>

          <div className="space-y-0.5">
            {filteredMentions.map((item, idx) => {
              const isSelected = idx === mentionIndex;
              if (item.type === 'all') {
                return (
                  <button
                    key="all"
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectMention(item)}
                    onMouseEnter={() => setMentionIndex(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                        : 'hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-red-500 text-white flex items-center justify-center shadow-xs shrink-0">
                      <span className="material-symbols-outlined text-[18px]">campaign</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-primary">@all</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          Notify Everyone
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectMention(item)}
                  onMouseEnter={() => setMentionIndex(idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                      : 'hover:bg-surface-container text-on-surface'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
                    {item.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photoUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      item.name.slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-on-surface truncate">
                        @{item.name}
                      </span>
                      {item.badge && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-surface-container-high text-on-surface-variant truncate max-w-[130px]">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.description && item.description !== item.badge && (
                      <p className="text-[10px] text-on-surface-variant truncate">
                        {item.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {recording ? (
        <div className="flex flex-col gap-1.5 px-3 py-2 rounded-2xl bg-surface-container-low border border-outline-variant/30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 animate-ping rounded-full bg-red-500" />
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                Recording (Opus)
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center gap-2">
              <div className="flex items-center gap-0.5">
                {[4, 12, 8, 16, 20, 14, 18, 10, 6, 14, 20, 8].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 bg-primary rounded-full animate-pulse"
                    style={{ height: `${h}px`, animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
              <span className="ml-2 text-xs font-mono font-bold text-on-surface">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-mono text-on-surface-variant">
                ({recordedMb} / 2.00 MB)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => stopRecording(false)}
                className="p-2 rounded-full text-red-500 hover:bg-red-500/10 transition-colors"
                title="Cancel recording"
              >
                <span className="material-symbols-outlined text-[20px]">delete</span>
              </button>
              <button
                onClick={() => stopRecording(true)}
                className="px-3.5 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-md hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1"
              >
                <span>Send</span>
                <span className="material-symbols-outlined text-[16px]">send</span>
              </button>
            </div>
          </div>

          {/* Size Limit Progress Bar */}
          <div className="w-full bg-surface-container rounded-full h-1 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                sizePercentage > 85 ? 'bg-red-500' : sizePercentage > 60 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${sizePercentage}%` }}
            />
          </div>
        </div>
      ) : (
        /* Standard WhatsApp Input Bar */
        <div className="flex items-end gap-2">
          {/* Emoji Trigger */}
          <button
            type="button"
            onClick={() => setShowEmojis((v) => !v)}
            className={`rounded-full p-2.5 transition-colors shrink-0 ${
              showEmojis
                ? 'bg-primary/15 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
            aria-label="Insert emoji"
            title="Emoji & Reactions"
          >
            <span className="material-symbols-outlined text-[24px]">sentiment_satisfied</span>
          </button>

          {/* Attachment Paperclip Menu Trigger */}
          <button
            type="button"
            onClick={() => setShowAttachMenu((v) => !v)}
            className={`rounded-full p-2.5 transition-colors shrink-0 ${
              showAttachMenu
                ? 'bg-primary/15 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
            aria-label="Attach file"
            title="Attach image, document or audio"
          >
            <span className="material-symbols-outlined text-[24px]">attach_file</span>
          </button>

          {/* Message Text Input Area */}
          <div className="flex-1 min-w-0 relative flex items-center rounded-2xl border border-outline-variant/30 bg-surface-container-low focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => handleChange(e.target.value)}
              onKeyUp={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
              onClick={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
              onSelect={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
              onKeyDown={(e) => {
                if (mentionState && filteredMentions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionIndex((prev) => (prev + 1) % filteredMentions.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    const selected = filteredMentions[mentionIndex] || filteredMentions[0];
                    if (selected) selectMention(selected);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setMentionState(null);
                    return;
                  }
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              onBlur={() => emitTyping(false)}
              placeholder={editing ? 'Edit message…' : 'Type a message…'}
              className="w-full max-h-36 resize-none bg-transparent px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
            />
          </div>

          {/* Action Trigger: Send Button (if text) or Voice Note Mic Button (if empty) */}
          {text.trim() || editing ? (
            <button
              onClick={submit}
              className="rounded-full bg-primary p-3 text-on-primary shadow-md hover:bg-primary/90 active:scale-95 transition-all shrink-0 flex items-center justify-center"
              aria-label={editing ? 'Save edit' : 'Send message'}
              title="Send (Enter)"
            >
              <span className="material-symbols-outlined text-[20px]">
                {editing ? 'check' : 'send'}
              </span>
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="rounded-full bg-surface-container p-3 text-on-surface-variant hover:bg-primary hover:text-on-primary active:scale-95 transition-all shrink-0 flex items-center justify-center"
              aria-label="Record voice note"
              title="Click to record voice note (Opus <= 2 MB)"
            >
              <span className="material-symbols-outlined text-[20px]">mic</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

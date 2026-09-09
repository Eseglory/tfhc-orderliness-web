'use client';
import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../../lib/chat';
import { useToast } from '../ui';

export function Composer({
  disabled,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSend,
  onAttach,
  onTyping,
}: {
  disabled?: boolean;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (text: string) => void | Promise<void>;
  onAttach: (file: File) => void | Promise<void>;
  onTyping: (typing: boolean) => void;
}) {
  const { notify } = useToast();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const emitTyping = (typing: boolean) => {
    if (typingRef.current === typing) return;
    typingRef.current = typing;
    onTyping(typing);
  };

  const handleChange = (v: string) => {
    setText(v);
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
    if (!value) return;
    emitTyping(false);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await onSend(value);
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return notify('Files must be 5 MB or smaller.', 'error');
    void onAttach(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecording(false);
        setElapsed(0);
        if (blob.size > 1000) {
          const ext = (recorder.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm';
          void onAttach(new File([blob], `voice-note.${ext}`, { type: blob.type }));
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      notify('Microphone access was denied.', 'error');
    }
  };

  const stopRecording = (send: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (!send) recorder.onstop = () => recorder.stream.getTracks().forEach((t) => t.stop());
    recorder.stop();
    setRecording(false);
    setElapsed(0);
  };

  if (disabled) {
    return (
      <div className="border-t border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-center text-xs text-on-surface-variant">
        This conversation is closed.
      </div>
    );
  }

  return (
    <div className="border-t border-outline-variant/20 bg-surface-container-lowest px-3 py-2">
      {(replyTo || editing) && (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-surface-container px-3 py-1.5 text-xs">
          <span className="material-symbols-outlined text-[16px] text-primary">
            {editing ? 'edit' : 'reply'}
          </span>
          <span className="min-w-0 flex-1 truncate text-on-surface-variant">
            {editing ? 'Editing message' : `Replying to ${replyTo?.sender?.name ?? 'message'}: ${replyTo?.body ?? 'attachment'}`}
          </span>
          <button
            onClick={editing ? onCancelEdit : onCancelReply}
            className="rounded p-0.5 text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Cancel"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 px-1 py-2">
          <span className="flex h-3 w-3 animate-pulse rounded-full bg-error" />
          <span className="flex-1 text-sm font-medium text-on-surface">
            Recording… {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
          <button
            onClick={() => stopRecording(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            onClick={() => stopRecording(true)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary"
          >
            Send
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <input ref={fileRef} type="file" accept="image/*,audio/*" hidden onChange={pickFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container"
            aria-label="Attach file"
          >
            <span className="material-symbols-outlined text-[22px]">attach_file</span>
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            onBlur={() => emitTyping(false)}
            placeholder={editing ? 'Edit your message…' : 'Write a message…'}
            className="max-h-32 flex-1 resize-none rounded-2xl border border-outline-variant/40 bg-surface-container-low px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          {text.trim() || editing ? (
            <button
              onClick={submit}
              className="rounded-full bg-primary p-2.5 text-on-primary hover:opacity-90"
              aria-label={editing ? 'Save edit' : 'Send message'}
            >
              <span className="material-symbols-outlined text-[20px]">{editing ? 'check' : 'send'}</span>
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="rounded-full bg-surface-container p-2.5 text-on-surface-variant hover:bg-surface-container-high"
              aria-label="Record voice note"
            >
              <span className="material-symbols-outlined text-[20px]">mic</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

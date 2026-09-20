'use client';

import { useEffect, useRef, useState } from 'react';
import { cancelUpload, resumableUpload } from '../lib/pwa/upload';
import type { ChatMessage } from '../lib/chat';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string, name: string): { icon: string; bg: string; color: string } {
  if (type.startsWith('image/')) {
    return { icon: 'image', bg: 'bg-rose-50 dark:bg-rose-950/60', color: 'text-rose-500' };
  }
  if (type.startsWith('audio/')) {
    return { icon: 'graphic_eq', bg: 'bg-purple-50 dark:bg-purple-950/60', color: 'text-purple-500' };
  }
  if (type.startsWith('video/')) {
    return { icon: 'videocam', bg: 'bg-blue-50 dark:bg-blue-950/60', color: 'text-blue-500' };
  }
  if (name.endsWith('.pdf') || type.includes('pdf')) {
    return { icon: 'picture_as_pdf', bg: 'bg-red-50 dark:bg-red-950/60', color: 'text-red-500' };
  }
  return { icon: 'description', bg: 'bg-amber-50 dark:bg-amber-950/60', color: 'text-amber-500' };
}

export function useUpload(onComplete: (message: ChatMessage) => void) {
  const [task, setTask] = useState<{ roomId: string; file: File; replyToId?: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const dismissTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      controller.current?.abort();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  async function start(roomId: string, file: File, replyToId?: string) {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (controller.current && !controller.current.signal.aborted) controller.current.abort();

    const current = new AbortController();
    controller.current = current;
    setTask({ roomId, file, replyToId });
    setBusy(true);
    setProgress(0);
    setStatus('Uploading…');
    setIsSuccess(false);

    try {
      const message = await resumableUpload(roomId, file, {
        replyToId,
        signal: current.signal,
        progress: setProgress,
      });
      onComplete(message);
      setIsSuccess(true);
      setProgress(100);
      setStatus('Sent');
      dismissTimer.current = setTimeout(() => {
        setTask(null);
        setStatus('');
        setIsSuccess(false);
      }, 1500);
    } catch (error) {
      if (controller.current !== current) return;
      setIsSuccess(false);
      setStatus(
        current.signal.aborted
          ? 'Paused'
          : error instanceof Error
          ? error.message
          : 'Upload interrupted',
      );
    } finally {
      if (controller.current === current) setBusy(false);
    }
  }

  const fileMeta = task ? getFileIcon(task.file.type, task.file.name) : null;
  const isError = !busy && !isSuccess && status && status !== 'Paused';

  const view = status ? (
    <section
      aria-label="File upload"
      className="mx-3 my-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-3.5 shadow-xl backdrop-blur-xl animate-in slide-in-from-bottom-2 duration-200 transition-all"
    >
      <div className="flex items-center gap-3">
        {fileMeta && (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/60 dark:border-slate-800/80 ${fileMeta.bg} ${fileMeta.color} shadow-xs`}
          >
            <span className="material-symbols-outlined text-[22px]">{fileMeta.icon}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
              {task?.file.name || 'Attachment'}
            </p>
            <span
              className={`text-[11px] font-bold shrink-0 ${
                isSuccess
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isError
                  ? 'text-[#f2320c]'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {status}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            <span>
              {task?.file.size ? formatBytes(task.file.size) : ''}
              {busy ? ` • ${progress}%` : ''}
            </span>
            {isSuccess && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Done
              </span>
            )}
          </div>
        </div>

        {/* Action button */}
        {!isSuccess && (
          <div className="shrink-0 flex items-center gap-1">
            {busy ? (
              <button
                type="button"
                onClick={() => controller.current?.abort()}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                title="Pause upload"
                aria-label="Pause upload"
              >
                <span className="material-symbols-outlined text-[18px]">pause</span>
              </button>
            ) : task ? (
              <button
                type="button"
                onClick={() => start(task.roomId, task.file, task.replyToId)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white transition-colors shadow-xs"
                title="Retry upload"
                aria-label="Retry upload"
              >
                <span className="material-symbols-outlined text-[18px]">replay</span>
              </button>
            ) : null}

            {task && !busy && (
              <button
                type="button"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await cancelUpload(task.roomId, task.file);
                    setTask(null);
                    setStatus('');
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : 'Could not cancel');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="Cancel upload"
                aria-label="Cancel upload"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress Track */}
      {task && !isSuccess && (
        <div className="relative mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isError
                ? 'bg-red-500'
                : 'bg-gradient-to-r from-[#f2320c] via-orange-500 to-amber-500 shadow-[0_0_8px_rgba(242,50,12,0.5)]'
            }`}
            style={{ width: `${Math.max(progress, isError ? 100 : 4)}%` }}
          />
        </div>
      )}
    </section>
  ) : null;

  return { start, view };
}

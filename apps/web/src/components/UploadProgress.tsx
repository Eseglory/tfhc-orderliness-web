'use client';
import { useEffect, useRef, useState } from 'react';
import { cancelUpload, resumableUpload } from '../lib/pwa/upload';
import type { ChatMessage } from '../lib/chat';
export function useUpload(onComplete: (message: ChatMessage) => void) {
  const [task, setTask] = useState<{ roomId: string; file: File; replyToId?: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function start(roomId: string, file: File, replyToId?: string) {
    if (controller.current && !controller.current.signal.aborted) controller.current.abort();
    const current = new AbortController(); controller.current = current;
    setTask({ roomId, file, replyToId }); setBusy(true); setProgress(0); setStatus('Uploading…');
    try {
      const message = await resumableUpload(roomId, file, { replyToId, signal: current.signal, progress: setProgress });
      onComplete(message); setTask(null); setStatus('File sent.');
    } catch (error) {
      if (controller.current !== current) return;
      setStatus(current.signal.aborted ? 'Upload paused. Retry to resume.' : error instanceof Error ? error.message : 'Upload interrupted. Retry to resume.');
    } finally { if (controller.current === current) setBusy(false); }
  }
  const view = status ? <section aria-label="File upload" className="p-3 bg-surface-container text-sm space-y-2">
    <p role="status">{task?.file.name} {status}</p>
    {task && <><progress aria-label="Upload progress" value={progress} max={100} className="w-full" /><p>{progress}% · Select the same file after reopening the app to resume.</p>
      {busy ? <button className="underline min-h-11" onClick={() => controller.current?.abort()}>Pause upload</button> :
        <><button className="underline min-h-11 mr-4" onClick={() => start(task.roomId, task.file, task.replyToId)}>Retry upload</button>
        <button className="underline min-h-11" onClick={async () => {
          setBusy(true);
          try { await cancelUpload(task.roomId, task.file); setTask(null); setStatus('Upload cancelled.'); }
          catch (error) { setStatus(error instanceof Error ? error.message : 'Connect to cancel the upload.'); }
          finally { setBusy(false); }
        }}>Cancel upload</button></>}</>}
  </section> : null;
  return { start, view };
}

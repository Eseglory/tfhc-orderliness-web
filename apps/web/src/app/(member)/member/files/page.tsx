'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pwaRuntime } from '../../../../lib/pwa/runtime';
import { prepareDevice } from '../../../../lib/pwa/device';
import { chatApi, ChatRoom } from '../../../../lib/chat';
import { useUpload } from '../../../../components/UploadProgress';

export default function FilesPage() {
  const router = useRouter();
  const [items, setItems] = useState<{ id: string; files: File[]; text: string }[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const upload = useUpload(() => setMessage('File sent to the selected conversation.'));

  async function load() {
    try {
      setItems(await (await pwaRuntime()).inbox());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open the inbox.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void prepareDevice().then(load).catch(() => {
      setMessage('Connect and sign in to review shared files.');
      setLoading(false);
    });
    void chatApi.rooms().then(setRooms).catch(() => setMessage('Connect to choose a conversation.'));
    const launch = (window as any).launchQueue;
    if (launch) {
      launch.setConsumer(async (params: { files: { getFile(): Promise<File> }[] }) => {
        try {
          const files = await Promise.all(params.files.map((handle) => handle.getFile()));
          await (await pwaRuntime()).receive(files);
          await load();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not open shared files.');
        }
      });
    }
  }, []);

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md pb-28 antialiased">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-edge-margin h-16 bg-background top-0 z-40 sticky border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">File Inbox</h1>
        </div>
        <Link
          href="/member/offline"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container text-xs font-bold text-primary hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-sm">offline_pin</span>
          <span className="hidden sm:inline">Offline &amp; Sync</span>
        </Link>
      </header>

      <main className="flex-1 px-edge-margin py-stack-md flex flex-col gap-section-gap w-full max-w-3xl mx-auto">
        {/* Intro Card */}
        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-[0px_2px_8px_rgba(0,0,0,0.05)] space-y-4">
          <div>
            <h2 className="font-headline-sm text-base font-bold text-primary">Share &amp; Review Files</h2>
            <p className="font-body-md text-xs text-on-surface-variant mt-1">
              Review files and text before sharing with your church team. Nothing is sent automatically. Incoming items expire after 10 minutes.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="font-label-sm text-xs font-semibold text-on-surface-variant mb-1 block">Choose local files</span>
              <input
                type="file"
                multiple
                className="block w-full text-xs text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-on-primary hover:file:bg-primary/90 cursor-pointer"
                accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,audio/webm,audio/mp4"
                onChange={async (event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = '';
                  try {
                    await (await pwaRuntime()).receive(files);
                    await load();
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Could not receive files.');
                  }
                }}
              />
            </label>

            <label className="block">
              <span className="font-label-sm text-xs font-semibold text-on-surface-variant mb-1 block">Target conversation</span>
              <select
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                className="block w-full rounded-lg border border-outline-variant p-2.5 text-xs bg-surface-container-lowest text-on-surface"
              >
                <option value="">Choose a team chat channel</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {message && (
            <p role="status" className="p-2.5 rounded-lg bg-secondary/10 text-secondary text-xs font-bold text-center">
              {message}
            </p>
          )}
          {upload.view}
        </section>

        {/* Inbox Items Feed */}
        <section className="space-y-3">
          <h3 className="font-label-md text-xs font-bold uppercase tracking-wider text-on-surface-variant">Staged Items</h3>
          {loading ? (
            <p className="text-center py-8 text-xs text-on-surface-variant">Loading file inbox…</p>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl text-outline-variant block mb-2">folder_open</span>
              <p className="font-body-md text-sm">No incoming staged files.</p>
              <p className="text-xs text-outline mt-1">Share a file from your device, or use the file picker above.</p>
            </div>
          ) : (
            items.map((item) => (
              <article key={item.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-xs space-y-3">
                {item.text && (
                  <div>
                    <p className="whitespace-pre-wrap break-words text-sm text-on-surface bg-surface-container-low p-3 rounded-lg">{item.text}</p>
                    <button
                      disabled={!roomId}
                      className="mt-2 text-xs font-bold text-primary underline disabled:opacity-50"
                      onClick={async () => {
                        try {
                          await chatApi.send(roomId, { body: item.text });
                          setMessage('Text sent to conversation.');
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : 'Text could not be sent.');
                        }
                      }}
                    >
                      Send reviewed text
                    </button>
                  </div>
                )}
                {item.files.map((file, index) => (
                  <div key={index} className="flex flex-wrap gap-2 items-center justify-between p-2.5 rounded-lg bg-surface-container-low">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-primary text-base">draft</span>
                      <span className="text-xs font-medium text-on-surface truncate">{file.name} · {Math.ceil(file.size / 1024)} KB</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="px-2.5 py-1 rounded bg-primary text-on-primary text-xs font-bold disabled:opacity-50"
                        disabled={!roomId}
                        onClick={() => upload.start(roomId, file)}
                      >
                        Send
                      </button>
                      <button
                        className="px-2.5 py-1 rounded border border-outline-variant text-xs text-on-surface"
                        onClick={() => {
                          const url = URL.createObjectURL(file);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = file.name;
                          link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-outline-variant/10 text-right">
                  <button
                    className="text-xs text-error hover:underline font-semibold"
                    onClick={async () => {
                      await (await pwaRuntime()).remove('inbox', item.id);
                      await load();
                    }}
                  >
                    Delete item
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
}

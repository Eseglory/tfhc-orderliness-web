'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { pwaRuntime } from '../../../../lib/pwa/runtime';
import { prepareDevice } from '../../../../lib/pwa/device';
import { chatApi, ChatRoom } from '../../../../lib/chat';
import { useUpload } from '../../../../components/UploadProgress';
export default function FilesPage() {
  const [items, setItems] = useState<{ id: string; files: File[]; text: string }[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const upload = useUpload(() => setMessage('File sent to the selected conversation.'));
  async function load() { try { setItems(await (await pwaRuntime()).inbox()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open the inbox.'); } }
  useEffect(() => {
    void prepareDevice().then(load).catch(() => setMessage('Connect and sign in to review shared files.'));
    void chatApi.rooms().then(setRooms).catch(() => setMessage('Connect to choose a conversation.'));
    const launch = (window as any).launchQueue;
    if (launch) launch.setConsumer(async (params: { files: { getFile(): Promise<File> }[] }) => {
      try { const files = await Promise.all(params.files.map(handle => handle.getFile())); await (await pwaRuntime()).receive(files); await load(); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open shared files.'); }
    });
  }, []);
  return <main className="max-w-3xl mx-auto p-5 pb-28 space-y-4">
    <Link className="underline" href="/member">Home</Link><h1 className="text-2xl font-bold">File inbox</h1>
    <p>Review files and text before sharing. Nothing is sent automatically. Incoming items expire after ten minutes.</p>
    <label className="block">Choose files<input type="file" multiple className="block w-full min-w-0 min-h-11" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,audio/webm,audio/mp4" onChange={async event => {
      const files = Array.from(event.target.files || []); event.target.value = '';
      try { await (await pwaRuntime()).receive(files); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not receive files.'); }
    }} /></label>
    <label className="block">Send to conversation<select value={roomId} onChange={event => setRoomId(event.target.value)} className="block w-full rounded border p-3 bg-background"><option value="">Choose a conversation</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <p role="status">{message}</p>{upload.view}
    {items.map(item => <article key={item.id} className="rounded-xl p-4 bg-surface-container space-y-3">
      {item.text && <><p className="whitespace-pre-wrap break-words">{item.text}</p><button disabled={!roomId} className="underline min-h-11 disabled:opacity-50" onClick={async () => {
        try { await chatApi.send(roomId, { body: item.text }); setMessage('Text sent.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Text could not be sent.'); }
      }}>Send reviewed text</button></>}
      {item.files.map((file, index) => <div key={index} className="flex flex-wrap gap-3 items-center"><span className="break-all">{file.name} · {Math.ceil(file.size / 1024)} KB</span>
        <button className="underline min-h-11 disabled:opacity-50" disabled={!roomId} onClick={() => upload.start(roomId, file)}>Send reviewed file</button>
        <button className="underline min-h-11" onClick={() => { const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Save file</button>
      </div>)}
      <button className="underline min-h-11" onClick={async () => { await (await pwaRuntime()).remove('inbox', item.id); await load(); }}>Delete inbox item</button>
    </article>)}
    {!items.length && <p>No incoming files. Share a file to TFHC from your device, open a supported file with the installed app, or use the picker above.</p>}
  </main>;
}

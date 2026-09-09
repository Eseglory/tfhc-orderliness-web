'use client';
import React, { useEffect, useState } from 'react';
import { Button, Modal, inputClass, useToast } from '../ui';
import { Avatar } from './Avatar';
import { chatApi, ChatContact, RoomMember } from '../../lib/chat';

function useContacts(open: boolean) {
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    chatApi
      .contacts()
      .then(setContacts)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open]);
  return { contacts, loading };
}

/** Pick a member to start (or open) a 1:1 conversation. */
export function ContactPickerModal({
  open,
  onClose,
  onPicked,
  online,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (memberId: string) => void;
  online: Set<string>;
}) {
  const { contacts, loading } = useContacts(open);
  const [q, setQ] = useState('');
  const filtered = contacts.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} title="New message" description="Start a direct conversation with a member.">
      <input
        autoFocus
        className={inputClass}
        placeholder="Search members…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
        {loading && <p className="py-6 text-center text-sm text-on-surface-variant">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-on-surface-variant">No members found.</p>
        )}
        {filtered.map((c) => (
          <button
            key={c.memberId}
            onClick={() => onPicked(c.memberId)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-container"
          >
            <Avatar name={c.name} photoUrl={c.photoUrl} online={online.has(c.memberId)} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-on-surface">{c.name}</span>
              <span className="block truncate text-xs text-on-surface-variant">
                {[c.roleInUnit, c.subTeam].filter(Boolean).join(' · ') || 'Member'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Create a custom room (requires messages.manage_rooms). */
export function NewRoomModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const { contacts } = useContacts(open);
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setPicked(new Set());
      setQ('');
    }
  }, [open]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = async () => {
    if (name.trim().length < 2) return notify('Give the room a name.', 'error');
    setSaving(true);
    try {
      const room = await chatApi.createRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        memberIds: [...picked],
      });
      notify('Room created.', 'success');
      onCreated(room.id);
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create the room.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = contacts.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New room"
      description="Create a group conversation and add members."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Create room
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-on-surface">Room name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-on-surface">Description</span>
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
          />
        </label>
        <div>
          <span className="text-sm font-semibold text-on-surface">Members ({picked.size})</span>
          <input
            className={`${inputClass} mt-1.5`}
            placeholder="Search members…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.memberId}
                onClick={() => toggle(c.memberId)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-container"
              >
                <input type="checkbox" readOnly checked={picked.has(c.memberId)} className="pointer-events-none h-4 w-4" />
                <Avatar name={c.name} photoUrl={c.photoUrl} size={32} />
                <span className="truncate text-sm text-on-surface">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Manage members of a custom room. */
export function ManageMembersModal({
  open,
  onClose,
  roomId,
  online,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  online: Set<string>;
  onChanged: () => void;
}) {
  const { contacts } = useContacts(open);
  const { notify } = useToast();
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => chatApi.roomMembers(roomId).then(setMembers).catch(() => undefined);
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roomId]);

  const memberIds = new Set(members.map((m) => m.memberId));
  const candidates = contacts.filter(
    (c) => !memberIds.has(c.memberId) && c.name.toLowerCase().includes(q.toLowerCase()),
  );

  const add = async (id: string) => {
    setBusy(true);
    try {
      await chatApi.addMembers(roomId, [id]);
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not add member.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try {
      await chatApi.removeMember(roomId, id);
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not remove member.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Room members" description={`${members.length} in this room`}>
      <div className="space-y-1">
        {members.map((m) => (
          <div key={m.memberId} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <Avatar name={m.name} photoUrl={m.photoUrl} size={32} online={online.has(m.memberId)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-on-surface">
                {m.name}
                {m.role === 'MODERATOR' && (
                  <span className="ml-1.5 rounded bg-secondary-container px-1.5 py-0.5 text-[10px] font-bold text-on-secondary-container">
                    Moderator
                  </span>
                )}
              </span>
            </span>
            {m.role !== 'MODERATOR' && (
              <button
                onClick={() => remove(m.memberId)}
                disabled={busy}
                className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error-container/40 hover:text-error"
                aria-label={`Remove ${m.name}`}
              >
                <span className="material-symbols-outlined text-[18px]">person_remove</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-outline-variant/20 pt-3">
        <span className="text-sm font-semibold text-on-surface">Add members</span>
        <input
          className={`${inputClass} mt-1.5`}
          placeholder="Search members…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {candidates.map((c) => (
            <button
              key={c.memberId}
              onClick={() => add(c.memberId)}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">person_add</span>
              <Avatar name={c.name} photoUrl={c.photoUrl} size={28} />
              <span className="truncate text-sm text-on-surface">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

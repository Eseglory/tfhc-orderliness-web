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
  const [selectedSubTeam, setSelectedSubTeam] = useState<string>('ALL');

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setPicked(new Set());
      setQ('');
      setSelectedSubTeam('ALL');
    }
  }, [open]);

  const subTeams = Array.from(new Set(contacts.map((c) => c.subTeam).filter(Boolean))) as string[];

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () => {
    const matching = contacts
      .filter((c) => selectedSubTeam === 'ALL' || c.subTeam === selectedSubTeam)
      .map((c) => c.memberId);
    setPicked((prev) => new Set([...prev, ...matching]));
  };

  const clearAll = () => {
    if (selectedSubTeam === 'ALL') {
      setPicked(new Set());
    } else {
      const inCurrentSubTeam = new Set(
        contacts.filter((c) => c.subTeam === selectedSubTeam).map((c) => c.memberId)
      );
      setPicked((prev) => new Set([...prev].filter((id) => !inCurrentSubTeam.has(id))));
    }
  };

  const submit = async () => {
    if (name.trim().length < 2) return notify('Give the room a name.', 'error');
    setSaving(true);
    try {
      const room = await chatApi.createRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        memberIds: [...picked],
      });
      notify('Room created successfully.', 'success');
      onCreated(room.id);
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create the room.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = contacts.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.subTeam && c.subTeam.toLowerCase().includes(q.toLowerCase())) ||
      (c.roleInUnit && c.roleInUnit.toLowerCase().includes(q.toLowerCase()));
    const matchesSubTeam = selectedSubTeam === 'ALL' || c.subTeam === selectedSubTeam;
    return matchesSearch && matchesSubTeam;
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create new chat room"
      description="Create a dedicated group conversation and invite church members or groups."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Create room ({picked.size} {picked.size === 1 ? 'member' : 'members'})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-on-surface">Room Name *</span>
          <input className={inputClass} placeholder="e.g. Protocol Team, Easter Planning, Unit Executives" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-on-surface">Description (Optional)</span>
          <input
            className={inputClass}
            placeholder="What is the purpose of this room?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
          />
        </label>

        <div>
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-sm font-semibold text-on-surface">
              Invite Members ({picked.size} selected)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Select All
              </button>
              <span className="text-outline-variant">·</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-semibold text-on-surface-variant hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Group / Sub-Team Filter Pills */}
          {subTeams.length > 0 && (
            <div className="flex flex-wrap gap-1.5 py-1.5">
              <button
                type="button"
                onClick={() => setSelectedSubTeam('ALL')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  selectedSubTeam === 'ALL'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                All Members ({contacts.length})
              </button>
              {subTeams.map((st) => {
                const count = contacts.filter((c) => c.subTeam === st).length;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedSubTeam(st)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      selectedSubTeam === st
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {st} ({count})
                  </button>
                );
              })}
            </div>
          )}

          <input
            className={`${inputClass} mt-1`}
            placeholder="Search by name, sub-team, or role…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-outline-variant/30 p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-on-surface-variant">No matching members found.</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.memberId}
                  type="button"
                  onClick={() => toggle(c.memberId)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-container transition-colors"
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={picked.has(c.memberId)}
                    className="h-4 w-4 rounded accent-primary pointer-events-none"
                  />
                  <Avatar name={c.name} photoUrl={c.photoUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-on-surface">{c.name}</span>
                    <span className="block truncate text-xs text-on-surface-variant">
                      {[c.subTeam, c.roleInUnit].filter(Boolean).join(' · ') || 'Member'}
                    </span>
                  </div>
                </button>
              ))
            )}
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
  const [selectedSubTeam, setSelectedSubTeam] = useState('ALL');
  const [pickedToAdd, setPickedToAdd] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = () => chatApi.roomMembers(roomId).then(setMembers).catch(() => undefined);
  useEffect(() => {
    if (open) {
      load();
      setPickedToAdd(new Set());
      setQ('');
      setSelectedSubTeam('ALL');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roomId]);

  const memberIds = new Set(members.map((m) => m.memberId));
  const candidates = contacts.filter((c) => !memberIds.has(c.memberId));
  const subTeams = Array.from(new Set(candidates.map((c) => c.subTeam).filter(Boolean))) as string[];

  const filteredCandidates = candidates.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.subTeam && c.subTeam.toLowerCase().includes(q.toLowerCase())) ||
      (c.roleInUnit && c.roleInUnit.toLowerCase().includes(q.toLowerCase()));
    const matchesSubTeam = selectedSubTeam === 'ALL' || c.subTeam === selectedSubTeam;
    return matchesSearch && matchesSubTeam;
  });

  const toggleCandidate = (id: string) => {
    setPickedToAdd((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllCandidates = () => {
    const matching = filteredCandidates.map((c) => c.memberId);
    setPickedToAdd((prev) => new Set([...prev, ...matching]));
  };

  const addSelected = async () => {
    if (pickedToAdd.size === 0) return;
    setBusy(true);
    try {
      await chatApi.addMembers(roomId, [...pickedToAdd]);
      notify(`Added ${pickedToAdd.size} ${pickedToAdd.size === 1 ? 'member' : 'members'}.`, 'success');
      setPickedToAdd(new Set());
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not add members.', 'error');
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
    <Modal open={open} onClose={onClose} title="Room members" description={`${members.length} active in this room`}>
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {members.map((m) => (
          <div key={m.memberId} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-container-low">
            <Avatar name={m.name} photoUrl={m.photoUrl} size={32} online={online.has(m.memberId)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-on-surface">
                {m.name}
                {m.role === 'MODERATOR' && (
                  <span className="ml-1.5 rounded bg-secondary-container px-1.5 py-0.5 text-[10px] font-bold text-on-secondary-container">
                    Moderator
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-on-surface-variant">
                {m.roleInUnit || 'Member'}
              </span>
            </span>
            {m.role !== 'MODERATOR' && (
              <button
                onClick={() => remove(m.memberId)}
                disabled={busy}
                className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error-container/40 hover:text-error transition-colors"
                aria-label={`Remove ${m.name}`}
              >
                <span className="material-symbols-outlined text-[18px]">person_remove</span>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-outline-variant/20 pt-3">
        <div className="flex items-center justify-between pb-1.5">
          <span className="text-sm font-semibold text-on-surface">
            Invite More Members ({candidates.length} available)
          </span>
          {pickedToAdd.size > 0 && (
            <Button className="text-xs px-3 py-1" onClick={addSelected} loading={busy}>
              Add ({pickedToAdd.size})
            </Button>
          )}
        </div>

        {subTeams.length > 0 && (
          <div className="flex flex-wrap gap-1 py-1">
            <button
              type="button"
              onClick={() => setSelectedSubTeam('ALL')}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                selectedSubTeam === 'ALL'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              All ({candidates.length})
            </button>
            {subTeams.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedSubTeam(st)}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                  selectedSubTeam === st
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {st}
              </button>
            ))}
            <button
              type="button"
              onClick={selectAllCandidates}
              className="text-[11px] font-bold text-primary hover:underline ml-auto"
            >
              Select All
            </button>
          </div>
        )}

        <input
          className={`${inputClass} mt-1`}
          placeholder="Search by name, sub-team, or role…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-outline-variant/30 p-1">
          {filteredCandidates.length === 0 ? (
            <p className="py-4 text-center text-xs text-on-surface-variant">No candidates to add.</p>
          ) : (
            filteredCandidates.map((c) => (
              <button
                key={c.memberId}
                type="button"
                onClick={() => toggleCandidate(c.memberId)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-container transition-colors"
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={pickedToAdd.has(c.memberId)}
                  className="h-4 w-4 rounded accent-primary pointer-events-none"
                />
                <Avatar name={c.name} photoUrl={c.photoUrl} size={28} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-on-surface">{c.name}</span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {[c.subTeam, c.roleInUnit].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { ProfilePhoto } from '../../../../components/ProfilePhoto';
import { Navbar } from '../../../../components/Navbar';
import { fetchApi } from '../../../../lib/api';
import { Plus, Users, Search, Filter, ShieldCheck } from 'lucide-react';

export default function AdminMembersPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [subTeams, setSubTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSubTeam, setSelectedSubTeam] = useState('');

  // Modals
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showSubTeamModal, setShowSubTeamModal] = useState(false);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessMember, setAccessMember] = useState<any>(null);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessStatus, setAccessStatus] = useState('ACTIVE');
  const [accessError, setAccessError] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gender, setGender] = useState('Male');
  const [subTeamId, setSubTeamId] = useState('');
  const [roleInUnit, setRoleInUnit] = useState('Member');
  const [subTeamName, setSubTeamName] = useState('');
  const [editingMember, setEditingMember] = useState<any>(null);
  const [status, setStatus] = useState('ACTIVE');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [memData, stData, user] = await Promise.all([
        fetchApi('/members'),
        fetchApi('/members/sub-teams'),
        fetchApi('/auth/me'),
      ]);
      setIsAdmin(user.role === 'ADMIN');
      setMembers(memData);
      setSubTeams(stData);
      setPageError('');
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Could not load members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setFormError('');
    try {
      await fetchApi(editingMember ? `/members/${editingMember.id}` : '/members', {
        method: editingMember ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...(editingMember ? { ...details, status } : {}),
          firstName,
          lastName,
          phoneNumber,
          email: !editingMember && isAdmin && email.trim() ? email.trim() : undefined,
          gender,
          subTeamId: subTeamId || (editingMember ? null : undefined),
          roleInUnit,
        }),
      });

      setShowMemberModal(false);
      setFirstName('');
      setLastName('');
      setPhoneNumber('');
      setEmail('');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTeamName.trim()) return;
    setSubmitting(true);
    try {
      await fetchApi('/members/sub-teams', {
        method: 'POST',
        body: JSON.stringify({ name: subTeamName }),
      });

      setShowSubTeamModal(false);
      setSubTeamName('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create sub-team');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.firstName.toLowerCase().includes(search.toLowerCase()) ||
      m.lastName.toLowerCase().includes(search.toLowerCase()) ||
      m.memberCode.toLowerCase().includes(search.toLowerCase()) ||
      (m.approvedMember?.email || m.user?.email || '').toLowerCase().includes(search.toLowerCase());
    const matchesSubTeam = selectedSubTeam ? m.subTeamId === selectedSubTeam : true;
    return matchesSearch && matchesSubTeam;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Member Directory</h1>
            <p className="text-xs text-slate-400 mt-1">Manage active unit members, roles & sub-team assignments</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSubTeamModal(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-slate-200 border border-slate-700"
            >
              + Add Sub-Team
            </button>
            <button
              onClick={() => { setEditingMember(null); setFirstName(''); setLastName(''); setPhoneNumber(''); setEmail(''); setSubTeamId(''); setRoleInUnit('Member'); setGender(''); setFormError(''); setShowMemberModal(true); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" /> Add New Member
            </button>
          </div>
        </div>

        {pageError && <p role="alert" className="text-red-300">{pageError}</p>}
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by member name, email or code..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={selectedSubTeam}
            onChange={(e) => setSelectedSubTeam(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Sub-Teams</option>
            {subTeams.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name} ({st._count?.members ?? 0})
              </option>
            ))}
          </select>
        </div>

        {/* Members Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-800/60 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Member Code</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Sub-Team</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Actions</th>
                  {isAdmin && <th className="px-6 py-4">Google access</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-mono font-bold text-indigo-400">{m.memberCode}</td>
                      <td className="px-6 py-4 font-semibold text-white">
                        {m.profilePhotoUrl && <img src={m.profilePhotoUrl} alt={`${m.firstName} profile picture`} className="w-10 h-10 rounded-full object-cover mb-1" />}
                        {m.firstName} {m.lastName}
                        <div className="text-xs text-slate-400">{m.approvedMember?.email || m.user?.email}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{m.phoneNumber}</td>
                      <td className="px-6 py-4 text-slate-300">{m.subTeam?.name || 'Unassigned'}</td>
                      <td className="px-6 py-4 text-slate-400">{m.roleInUnit}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {m.status}
                        </span>
                      </td>
                      <td className="px-6 py-4"><button className="text-indigo-300 underline" aria-label={`Edit ${m.firstName} ${m.lastName}`} onClick={() => {
                        setEditingMember(m); setFirstName(m.firstName); setLastName(m.lastName); setPhoneNumber(m.phoneNumber);
                        setEmail(m.approvedMember?.email || m.user?.email || ''); setGender(m.gender || ''); setSubTeamId(m.subTeamId || ''); setRoleInUnit(m.roleInUnit); setStatus(m.status);
                        setDetails(Object.fromEntries(['middleName', 'preferredName', 'alternatePhoneNumber', 'address', 'profession', 'birthday', 'dateOfBirth'].map(k => [k, k === 'dateOfBirth' ? m[k]?.slice(0, 10) || '' : m[k] || ''])));
                        setFormError(''); setShowMemberModal(true);
                      }}>Edit</button></td>
                      {isAdmin && <td className="px-6 py-4">
                        <button className="text-indigo-300 underline text-left" onClick={() => {
                          setAccessMember(m); setAccessEmail(m.approvedMember?.email || m.user?.email || '');
                          setAccessStatus(m.approvedMember?.status || 'ACTIVE'); setAccessError('');
                        }} aria-label={`Manage Google access for ${m.firstName} ${m.lastName}`}>
                          {m.approvedMember?.status || 'Not approved'}
                        </button>
                      </td>}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="px-6 py-12 text-center text-slate-500">
                      {loading ? 'Loading member profiles...' : 'No matching member records found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {accessMember && <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="google-access-title" className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4" onSubmit={async e => {
            e.preventDefault(); setSubmitting(true); setAccessError('');
            try {
              await fetchApi(`/members/${accessMember.id}/google-access`, { method: 'PUT', body: JSON.stringify({ email: accessEmail, status: accessStatus }) });
              setAccessMember(null); await loadData();
            } catch (error: any) { setAccessError(error.message); }
            finally { setSubmitting(false); }
          }}>
            <h2 id="google-access-title" className="text-xl font-bold">Google sign-in access</h2>
            <p>{accessMember.firstName} {accessMember.lastName}</p>
            <label className="block" htmlFor="access-email">Google email</label>
            <input id="access-email" type="email" required value={accessEmail} readOnly={Boolean(accessMember.user || accessMember.approvedMember)} onChange={e => setAccessEmail(e.target.value)} className="w-full rounded p-3 bg-slate-800" />
            <label className="block" htmlFor="access-status">Access status</label>
            <select id="access-status" value={accessStatus} onChange={e => setAccessStatus(e.target.value)} className="w-full rounded p-3 bg-slate-800">
              <option value="ACTIVE">Approved</option><option value="REVOKED">Revoked</option>
            </select>
            {accessError && <p role="alert" className="text-red-300">{accessError}</p>}
            <div className="flex justify-end gap-4">
              <button type="button" disabled={submitting} onClick={() => setAccessMember(null)}>Cancel</button>
              <button disabled={submitting} className="bg-indigo-600 rounded px-4 py-2">{submitting ? 'Saving...' : 'Save Google access'}</button>
            </div>
          </form>
        </div>}

        {/* Create Member Modal */}
        {showMemberModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white">{editingMember ? 'Edit Member' : 'Add New Unit Member'}</h2>
              {editingMember && <ProfilePhoto value={editingMember.profilePhotoUrl} endpoint={`/members/${editingMember.id}/photo`} onChange={url => { setEditingMember((m: any) => ({ ...m, profilePhotoUrl: url })); void loadData(); }} />}

              <form onSubmit={handleCreateMember} className="space-y-4">
                {formError && <p role="alert" className="text-red-300">{formError}</p>}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1" htmlFor="firstName">First Name</label>
                    <input
                      type="text"
                      required
                      id="firstName" value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1" htmlFor="lastName">Last Name</label>
                    <input
                      type="text"
                      required
                      id="lastName" value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1" htmlFor="phoneNumber">Phone Number</label>
                  <input
                    type="text"
                    required
                    id="phoneNumber" value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+234..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {isAdmin && <div>
                  <label htmlFor="member-google-email" className="block text-xs font-semibold text-slate-400 mb-1">Google email</label>
                  <input id="member-google-email" type="email" required={!editingMember} readOnly={Boolean(editingMember)} value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white" />
                  <p className="text-xs text-slate-400 mt-1">Email is the fixed sign-in identifier. New members are approved to use this Google account.</p>
                </div>}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Sub-Team</label>
                    <select
                      value={subTeamId}
                      onChange={(e) => setSubTeamId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Unassigned</option>
                      {subTeams.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1" htmlFor="roleInUnit">Role in Unit</label>
                    <input
                      type="text"
                      id="roleInUnit" value={roleInUnit}
                      onChange={(e) => setRoleInUnit(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <label className="block text-sm">Gender<input value={gender} onChange={e => setGender(e.target.value)} className="block w-full bg-slate-800 rounded p-2" /></label>
                {editingMember && <>
                  {Object.entries({ middleName: 'Middle name', preferredName: 'Preferred name', alternatePhoneNumber: 'Alternate phone', address: 'Address', profession: 'Profession', birthday: 'Birthday (MM-DD)', dateOfBirth: 'Date of birth' }).map(([key, label]) => <label key={key} className="block text-sm">{label}<input type={key === 'dateOfBirth' ? 'date' : 'text'} value={details[key] || ''} onChange={e => setDetails(d => ({ ...d, [key]: e.target.value }))} className="block w-full bg-slate-800 rounded p-2" /></label>)}
                  <label className="block text-sm">Member status<select value={status} onChange={e => setStatus(e.target.value)} className="block w-full bg-slate-800 rounded p-2">{['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXEMPT', 'NEW_MEMBER'].map(v => <option key={v}>{v}</option>)}</select></label>
                  <p className="text-xs text-slate-400">Only active members can sign in. Deactivation preserves their history.</p>
                </>}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowMemberModal(false)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20"
                  >
                    {submitting ? 'Saving...' : 'Save Member'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Sub-Team Modal */}
        {showSubTeamModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Create New Sub-Team</h2>

              <form onSubmit={handleCreateSubTeam} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Sub-Team Name</label>
                  <input
                    type="text"
                    required
                    value={subTeamName}
                    onChange={(e) => setSubTeamName(e.target.value)}
                    placeholder="e.g. Protocol Team B"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSubTeamModal(false)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20"
                  >
                    {submitting ? 'Saving...' : 'Create Sub-Team'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

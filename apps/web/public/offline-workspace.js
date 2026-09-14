(() => {
  const store = globalThis.TFHCPwa;
  const status = document.getElementById('status');
  const records = document.getElementById('records');
  const element = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
  document.getElementById('retry').onclick = () => location.reload();
  async function render() {
    records.replaceChildren();
    const saved = await store.list();
    if (!saved.length) records.append(element('p', 'No saved schedules or drafts yet. Save them from the connected app.'));
    for (const incoming of await store.inbox()) {
      const card = element('article'); card.append(element('h2', 'Incoming files — review before sharing'));
      if (incoming.text) card.append(element('p', incoming.text));
      for (const file of incoming.files) {
        const download = element('button', `Save ${file.name}`);
        download.onclick = () => { const url = URL.createObjectURL(file); const link = element('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
        card.append(download);
      }
      const link = element('a', 'Open file inbox when connected'); link.href = '/member/files'; card.append(link); records.append(card);
    }
    for (const record of saved) {
      const row = await store.read(record.name); if (!row) continue;
      const card = element('article');
      card.append(element('h2', record.kind === 'schedule' ? 'Saved schedule' : record.name === 'excuse' ? 'Absence request draft' : 'Chat draft'));
      card.append(element('p', `Saved ${new Date(row.savedAt).toLocaleString()}. Review changes when connected.`));
      if (record.kind === 'schedule' && Array.isArray(row.value)) {
        for (const item of row.value) card.append(element('p', `${item.title} — ${new Date(item.startTime).toLocaleString()} · ${item.locationName || 'Venue to be confirmed'}`));
      } else {
        const label = element('label', 'Draft text'); const field = element('textarea');
        field.value = row.value.details ?? row.value.text ?? ''; label.append(field); card.append(label);
        const save = element('button', 'Save draft changes');
        save.onclick = async () => {
          try {
            const value = { ...row.value, [record.name === 'excuse' ? 'details' : 'text']: field.value };
            await store.save(record.name, value, row.revision); status.textContent = 'Draft saved. It has not been submitted.'; await render();
          } catch (error) { status.textContent = error.message; }
        };
        card.append(save);
      }
      const remove = element('button', 'Delete saved item');
      remove.onclick = async () => { if (confirm('Delete this saved item?')) { await store.deleteRecord(record.name); await render(); } };
      card.append(remove); records.append(card);
    }
  }
  document.getElementById('unlock-form').onsubmit = async event => {
    event.preventDefault(); const field = document.getElementById('passphrase');
    try { await store.unlock(field.value); field.value = ''; await render(); document.getElementById('lock').hidden = false; status.textContent = 'Saved content unlocked.'; }
    catch (error) { status.textContent = error.message; }
  };
  document.getElementById('lock').onclick = () => { store.lock(); records.replaceChildren(); status.textContent = 'Saved content locked.'; };
  if ('launchQueue' in window) window.launchQueue.setConsumer(async params => {
    try { await store.receive(await Promise.all(params.files.map(handle => handle.getFile()))); status.textContent = 'Files received. Unlock to review them.'; if (store.isUnlocked()) await render(); }
    catch (error) { status.textContent = error.message; }
  });
  addEventListener('storage', event => { if (event.key === 'tfhc_token') { store.lock(); records.replaceChildren(); } });
})();

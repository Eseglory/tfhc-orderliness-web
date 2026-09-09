// Usage: node scripts/import-member-details.cjs /path/to/members.csv [--apply]
// Updates existing approved profiles only; never changes email or account access.
const fs = require('fs');
const path = require('path');
const req = require('module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const { parse } = req('csv-parse/sync');
const { PrismaClient } = req('@prisma/client');
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const seen = new Set();
const rows = parse(fs.readFileSync(process.argv[2]), { columns: true, skip_empty_lines: true }).map((r, index) => {
  const email = r.Email.trim().toLowerCase();
  const match = r.Birthday.trim().toLowerCase().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/);
  const month = match ? months.indexOf(match[2]) + 1 : 0;
  const birthday = match && month ? `${String(month).padStart(2,'0')}-${match[1].padStart(2,'0')}` : null;
  const date = birthday && new Date(`2000-${birthday}T00:00:00Z`);
  const data = { firstName: r.FirstName.trim(), lastName: r.LastName.trim(), phoneNumber: r.PhoneNumber.replace(/[^+0-9]/g, ''), profession: r.Profession.trim() || null, birthday };
  if (!email || seen.has(email) || !data.firstName || !data.lastName || data.phoneNumber.length < 7 || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(5,10) !== birthday) throw new Error(`Invalid or duplicate spreadsheet row ${index + 2}`);
  seen.add(email);
  return { email, data };
});
const p = new PrismaClient();
(async () => {
  await p.$transaction(async tx => {
    const approvals = await tx.approvedMember.findMany({ where: { normalizedEmail: { in: rows.map(r => r.email) } } });
    if (approvals.length !== rows.length || approvals.some(a => !a.memberId)) throw new Error('Every spreadsheet email must already have a linked approved member');
    if (!process.argv.includes('--apply')) { console.log(`Validated ${rows.length} linked profiles; use --apply to import.`); return; }
    for (const row of rows) await tx.member.update({ where: { id: approvals.find(a => a.normalizedEmail === row.email).memberId }, data: row.data });
  }, { isolationLevel: 'Serializable', timeout: 120000 });
  if (process.argv.includes('--apply')) {
    const saved = await p.approvedMember.findMany({ where: { normalizedEmail: { in: rows.map(r => r.email) } }, include: { member: true } });
    if (saved.length !== rows.length || saved.some(a => Object.entries(rows.find(r => r.email === a.normalizedEmail).data).some(([k,v]) => a.member[k] !== v))) throw new Error('Post-import verification failed');
    console.log(`Verified ${saved.length} profiles; ${rows.filter(r => r.data.profession).length} professions and ${rows.length} birthdays saved.`);
  }
})().catch(e => { console.error(e.code || 'Import failed: check input and database connection'); process.exitCode = 1; }).finally(() => p.$disconnect());

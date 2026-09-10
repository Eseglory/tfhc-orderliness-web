const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '..');

async function provision(db, email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 20) throw new Error('A valid administrator email and password of at least 20 characters are required.');
  const hash = await argon2.hash(password);
  return db.$transaction(async tx => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing && (existing.role !== 'ADMIN' || !await argon2.verify(existing.passwordHash, password))) {
      throw new Error('Existing account cannot be promoted or have its password replaced by bootstrap.');
    }
    if (!existing && await tx.user.count({ where: { role: 'ADMIN' } })) throw new Error('An administrator already exists; bootstrap is only for the first administrator.');
    const admin = existing || await tx.user.create({ data: { email, passwordHash: hash, role: 'ADMIN', passwordAuthEnabled: true, emailVerifiedAt: new Date(), passwordChangedAt: new Date() } });
    const categories = [
      { name: 'Unit Meeting', basePoints: 10, pointWeight: 1 },
      { name: 'Sunday Service', basePoints: 5, pointWeight: 1 },
      { name: 'Midweek Service', basePoints: 5, pointWeight: 1 },
      { name: 'Training', basePoints: 10, pointWeight: 1.5 },
      { name: 'Special Programme', basePoints: 15, pointWeight: 2 },
    ];
    for (const category of categories) await tx.meetingCategory.upsert({ where: { name: category.name }, update: {}, create: category });
    if (!existing) await tx.auditLog.create({ data: { actorUserId: admin.id, action: 'ADMIN_BOOTSTRAPPED', entity: 'User', entityId: admin.id, newData: { email, role: 'ADMIN' } } });
    return admin.id;
  }, { isolationLevel: 'Serializable', timeout: 20000 });
}

async function main() {
  dotenv.config({ path: path.join(root, 'apps/api/.env'), quiet: true });
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to the approved account owner.');
  const file = path.join(root, 'apps/api/.env.bootstrap-admin');
  let password;
  if (fs.existsSync(file)) {
    const saved = dotenv.parse(fs.readFileSync(file));
    if (saved.BOOTSTRAP_ADMIN_EMAIL !== email) throw new Error('Saved bootstrap credentials belong to another email.');
    password = saved.BOOTSTRAP_ADMIN_PASSWORD;
  } else {
    password = crypto.randomBytes(32).toString('base64url');
    fs.writeFileSync(file, `BOOTSTRAP_ADMIN_EMAIL=${email}\nBOOTSTRAP_ADMIN_PASSWORD=${password}\n`, { mode: 0o600, flag: 'wx' });
  }
  const db = new PrismaClient();
  try {
    await provision(db, email, password);
    console.log('Administrator and meeting categories provisioned. Credentials are in apps/api/.env.bootstrap-admin (owner-readable, gitignored).');
  } finally { await db.$disconnect(); }
}
module.exports = { provision };
if (require.main === module) main().catch(error => { console.error(error.code ? `Provisioning failed (${error.code})` : error.message); process.exitCode = 1; });

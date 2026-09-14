import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// Explicit operator action only. Supply credentials through the environment.
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_NEW_PASSWORD;
  if (!email || !password || password.length < 20 || !process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL, ADMIN_EMAIL and ADMIN_NEW_PASSWORD (at least 20 characters).');
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    if (user.role !== 'ADMIN') throw new Error('This operation cannot promote a member account.');
    await prisma.user.update({ where: { id: user.id }, data: {
      passwordHash: await argon2.hash(password), passwordChangedAt: new Date(),
      passwordResetTokenHash: null, passwordResetExpiresAt: null,
    } });
    console.log('Administrator password updated; prior sessions will be revoked.');
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('Password update failed. Check the account and environment configuration.'); process.exitCode = 1; });

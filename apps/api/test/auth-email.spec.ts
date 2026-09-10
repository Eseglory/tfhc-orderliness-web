import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';

jest.mock('argon2', () => ({ hash: jest.fn(async () => 'HASH'), verify: jest.fn(async () => true) }));

const config = { get: (k: string) => ({ NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:3000' } as Record<string, string>)[k] } as any;
const jwtService = { sign: jest.fn(() => 'signed.jwt.token') } as any;
const rbac = { resolveAccess: jest.fn(async () => ({ roleKeys: [], permissions: [], isSuperAdmin: false })) } as any;

function makeService(prisma: any, mail: any = { sendEmail: jest.fn(async () => ({ messageId: 'm' })) }) {
  return new AuthService(prisma, jwtService, rbac, mail, config);
}

const activeApproved = (over: any = {}) => ({
  status: 'ACTIVE',
  normalizedEmail: 'jane@tfhc.org',
  member: { id: 'mem1', status: 'ACTIVE', firstName: 'Jane', lastName: 'Doe', phoneNumber: '08011112222', userId: null, user: null, ...over.member },
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('AuthService.registerUser', () => {
  it('rejects an email that is not on the approved list', async () => {
    const prisma = { approvedMember: { findUnique: jest.fn(async () => null) } };
    await expect(makeService(prisma as any).registerUser({ email: 'x@y.com', password: 'longenough12', firstName: 'A', lastName: 'B', phoneNumber: '08000000000' }))
      .rejects.toMatchObject({ response: { code: 'EMAIL_NOT_APPROVED' } });
  });

  it('rejects an approved email with no linked member record', async () => {
    const prisma = { approvedMember: { findUnique: jest.fn(async () => ({ status: 'ACTIVE', member: null })) } };
    await expect(makeService(prisma as any).registerUser({ email: 'jane@tfhc.org', password: 'longenough12', firstName: 'A', lastName: 'B', phoneNumber: '08000000000' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates and links a user for an approved member, sends verification, and returns no session', async () => {
    const tx = { user: { create: jest.fn(async () => ({ id: 'u1' })), update: jest.fn() }, member: { update: jest.fn() } };
    const mail = { sendEmail: jest.fn(async () => ({ messageId: 'm' })) };
    const prisma = {
      approvedMember: { findUnique: jest.fn(async () => activeApproved()) },
      user: { findUnique: jest.fn(async () => null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const res = await makeService(prisma as any, mail).registerUser({ email: 'Jane@tfhc.org', password: 'longenough12', firstName: 'Jane', lastName: 'Doe', phoneNumber: '08011112222' });
    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.member.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'mem1' } }));
    expect(mail.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@tfhc.org' }));
    expect(res).toMatchObject({ pendingVerification: true });
    expect(res).not.toHaveProperty('accessToken');
  });

  it('upgrades an existing Google-only member instead of creating a second account', async () => {
    const existingUser = { id: 'u9', role: 'MEMBER', passwordAuthEnabled: false, emailVerifiedAt: null };
    const tx = { user: { update: jest.fn(), create: jest.fn() }, member: { update: jest.fn() } };
    const prisma = {
      approvedMember: { findUnique: jest.fn(async () => activeApproved({ member: { id: 'mem1', status: 'ACTIVE', firstName: 'Jane', lastName: 'Doe', phoneNumber: '0801', userId: 'u9', user: existingUser } })) },
      user: { findUnique: jest.fn(async () => existingUser) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const res = await makeService(prisma as any).registerUser({ email: 'jane@tfhc.org', password: 'longenough12', firstName: 'Jane', lastName: 'Doe', phoneNumber: '0801' });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u9' } }));
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(res).toMatchObject({ pendingVerification: true });
  });

  it('refuses a duplicate when a verified password account already exists', async () => {
    const existingUser = { id: 'u9', role: 'MEMBER', passwordAuthEnabled: true, emailVerifiedAt: new Date() };
    const prisma = {
      approvedMember: { findUnique: jest.fn(async () => activeApproved({ member: { id: 'mem1', status: 'ACTIVE', firstName: 'J', lastName: 'D', phoneNumber: '0801', userId: 'u9', user: existingUser } })) },
      user: { findUnique: jest.fn(async () => existingUser) },
    };
    await expect(makeService(prisma as any).registerUser({ email: 'jane@tfhc.org', password: 'longenough12', firstName: 'J', lastName: 'D', phoneNumber: '0801' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService.verifyEmail', () => {
  it('rejects an unknown or expired token', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => null) } };
    await expect(makeService(prisma as any).verifyEmail({ token: 'a'.repeat(40) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks the email verified and issues a session', async () => {
    const user = { id: 'u1', email: 'jane@tfhc.org', role: 'MEMBER', emailVerifyExpiresAt: new Date(Date.now() + 10000), passwordChangedAt: null };
    const prisma = {
      user: {
        findUnique: jest.fn(async () => user),
        update: jest.fn(async () => ({ id: 'u1', email: 'jane@tfhc.org', role: 'MEMBER', member: { id: 'mem1' } })),
      },
    };
    const res = await makeService(prisma as any).verifyEmail({ token: 'a'.repeat(40) });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }) }));
    expect(res.accessToken).toBe('signed.jwt.token');
    expect(res.user).toMatchObject({ id: 'u1', role: 'MEMBER' });
  });
});

describe('AuthService.forgotPassword / resetPassword', () => {
  it('does not reveal whether an account exists', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => null), update: jest.fn() } };
    await expect(makeService(prisma as any).forgotPassword({ email: 'nobody@tfhc.org' })).resolves.toEqual({ ok: true, devUrl: undefined });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('stores a reset token and emails a password-enabled account', async () => {
    const mail = { sendEmail: jest.fn(async () => ({ messageId: 'm' })) };
    const prisma = { user: { findUnique: jest.fn(async () => ({ id: 'u1', passwordAuthEnabled: true, member: { firstName: 'Jane' } })), update: jest.fn() } };
    await makeService(prisma as any, mail).forgotPassword({ email: 'jane@tfhc.org' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passwordResetTokenHash: expect.any(String) }) }));
    expect(mail.sendEmail).toHaveBeenCalled();
  });

  it('rejects an expired reset token', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ id: 'u1', passwordResetExpiresAt: new Date(Date.now() - 1000) })) } };
    await expect(makeService(prisma as any).resetPassword({ token: 'a'.repeat(40), password: 'longenough12' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets the new password, bumps passwordChangedAt and verifies the email', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({ id: 'u1', passwordResetExpiresAt: new Date(Date.now() + 10000), emailVerifiedAt: null })),
        update: jest.fn(async () => ({ id: 'u1', email: 'j@tfhc.org', role: 'MEMBER', member: { id: 'mem1' } })),
      },
    };
    const res = await makeService(prisma as any).resetPassword({ token: 'a'.repeat(40), password: 'longenough12' });
    const data = (prisma.user.update as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ passwordChangedAt: expect.any(Date), emailVerifiedAt: expect.any(Date) });
    expect(res.accessToken).toBe('signed.jwt.token');
  });
});

describe('AuthService.changePassword', () => {
  const basePrisma = () => ({ user: { findUnique: jest.fn(async () => ({ id: 'u1', email: 'j@tfhc.org', role: 'ADMIN', passwordHash: 'HASH', passwordAuthEnabled: true, member: { id: 'mem1' } })), update: jest.fn() } });

  it('rejects a wrong current password', async () => {
    (argon2.verify as jest.Mock).mockResolvedValueOnce(false);
    await expect(makeService(basePrisma() as any).changePassword('u1', { currentPassword: 'nope', newPassword: 'longenough12' }))
      .rejects.toMatchObject({ response: { code: 'CURRENT_PASSWORD_INVALID' } });
  });

  it('rejects reusing the current password', async () => {
    (argon2.verify as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    await expect(makeService(basePrisma() as any).changePassword('u1', { currentPassword: 'same12chars!', newPassword: 'same12chars!' }))
      .rejects.toMatchObject({ response: { code: 'PASSWORD_REUSED' } });
  });

  it('updates the hash and returns a fresh token', async () => {
    (argon2.verify as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const prisma = basePrisma();
    const res = await makeService(prisma as any).changePassword('u1', { currentPassword: 'oldpassword12', newPassword: 'brandnewpass12' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passwordChangedAt: expect.any(Date) }) }));
    expect(res).toEqual({ accessToken: 'signed.jwt.token' });
  });
});

describe('AuthService.loginUser member rules', () => {
  it('directs Google-only members to Google sign-in', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ id: 'u1', email: 'm@tfhc.org', role: 'MEMBER', passwordHash: 'HASH', passwordAuthEnabled: false, member: {} })) } };
    await expect(makeService(prisma as any).loginUser({ email: 'm@tfhc.org', password: 'whatever12345' }))
      .rejects.toMatchObject({ response: { code: 'MEMBER_GOOGLE_AUTH_REQUIRED' } });
  });

  it('blocks login until the email is verified', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ id: 'u1', email: 'm@tfhc.org', role: 'MEMBER', passwordHash: 'HASH', passwordAuthEnabled: true, emailVerifiedAt: null, isActive: true, member: { status: 'ACTIVE', approvedMember: { status: 'ACTIVE', normalizedEmail: 'm@tfhc.org' } } })) } };
    await expect(makeService(prisma as any).loginUser({ email: 'm@tfhc.org', password: 'whatever12345' }))
      .rejects.toMatchObject({ response: { code: 'EMAIL_VERIFICATION_PENDING' } });
  });
});

describe('JwtStrategy password-change invalidation', () => {
  const strategy = (user: any) => new JwtStrategy(
    { getOrThrow: () => 'secret', get: () => undefined } as any,
    { user: { findUnique: jest.fn(async () => user) } } as any,
    rbac,
  );

  it('rejects a token issued before the last password change', async () => {
    const user = { id: 'u1', email: 'a@b.com', role: 'ADMIN', isActive: true, passwordChangedAt: new Date('2026-02-01T00:00:00Z'), member: null };
    await expect(strategy(user).validate({ sub: 'u1', email: 'a@b.com', role: 'ADMIN', iat: Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000) }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a token issued after the last password change', async () => {
    const user = { id: 'u1', email: 'a@b.com', role: 'ADMIN', isActive: true, passwordChangedAt: new Date('2026-01-01T00:00:00Z'), member: null };
    const res = await strategy(user).validate({ sub: 'u1', email: 'a@b.com', role: 'ADMIN', iat: Math.floor(new Date('2026-02-01T00:00:00Z').getTime() / 1000) });
    expect(res).toMatchObject({ userId: 'u1', role: 'ADMIN' });
  });
});

import { provision } from '../../../scripts/bootstrap-admin.cjs';
import * as argon2 from 'argon2';

describe('First administrator provisioning', () => {
  const password = 'RandomTestOnlyPassword!123456';
  test('rejects invalid identity and weak credentials before database access', async () => {
    const db = { $transaction: jest.fn() };
    await expect(provision(db, 'invalid', password)).rejects.toThrow('valid administrator');
    await expect(provision(db, 'admin@example.test', 'weak')).rejects.toThrow('valid administrator');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  test('cannot promote an existing member account', async () => {
    const tx = { user: { findUnique: jest.fn().mockResolvedValue({role:'MEMBER'}) } };
    await expect(provision({$transaction:callback=>callback(tx)},'member@example.test',password)).rejects.toThrow('cannot be promoted');
  });
  test('cannot create a second bootstrap administrator', async () => {
    const tx = { user: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(1) } };
    await expect(provision({$transaction:callback=>callback(tx)},'second@example.test',password)).rejects.toThrow('administrator already exists');
  });
  test('rerunning with the same credentials preserves the administrator and categories', async () => {
    const tx = {
      user: {findUnique:jest.fn().mockResolvedValue({id:'admin',role:'ADMIN',passwordHash:await argon2.hash(password)}),create:jest.fn()},
      meetingCategory:{upsert:jest.fn()},auditLog:{create:jest.fn()},
    };
    await expect(provision({$transaction:callback=>callback(tx)},'admin@example.test',password)).resolves.toBe('admin');
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.meetingCategory.upsert).toHaveBeenCalledTimes(5);
  });
});

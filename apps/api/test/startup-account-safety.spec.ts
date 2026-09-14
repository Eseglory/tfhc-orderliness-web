import { RbacService } from '../src/common/rbac/rbac.service';

test('startup initializes reference data without reading or rewriting account credentials', async () => {
  const prisma = {
    eventType: { upsert: jest.fn().mockResolvedValue({}) },
    meetingCategory: { upsert: jest.fn().mockResolvedValue({}) },
    chatRoom: { upsert: jest.fn().mockResolvedValue({}) },
    systemSetting: { upsert: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    member: { create: jest.fn(), update: jest.fn() },
    userAccessRole: { upsert: jest.fn() },
  };
  const service = new RbacService(prisma as any);
  jest.spyOn(service, 'syncSystemRoles').mockResolvedValue(undefined);
  await service.onApplicationBootstrap();
  expect(prisma.systemSetting.upsert).toHaveBeenCalled();
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(prisma.user.create).not.toHaveBeenCalled();
  expect(prisma.user.update).not.toHaveBeenCalled();
  expect(prisma.member.update).not.toHaveBeenCalled();
  expect(prisma.userAccessRole.upsert).not.toHaveBeenCalled();
});

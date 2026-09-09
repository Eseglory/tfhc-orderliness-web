-- RBAC foundation: access roles, granular permissions, per-user role grants,
-- plus staff-account lifecycle fields on users.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "inviteAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "access_roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_access_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_access_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_roles_key_key" ON "access_roles"("key");

-- CreateIndex
CREATE INDEX "access_role_permissions_permission_idx" ON "access_role_permissions"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "access_role_permissions_roleId_permission_key" ON "access_role_permissions"("roleId", "permission");

-- CreateIndex
CREATE INDEX "user_access_roles_userId_idx" ON "user_access_roles"("userId");

-- CreateIndex
CREATE INDEX "user_access_roles_roleId_idx" ON "user_access_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_access_roles_userId_roleId_key" ON "user_access_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_inviteTokenHash_key" ON "users"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- AddForeignKey
ALTER TABLE "access_role_permissions" ADD CONSTRAINT "access_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_access_roles" ADD CONSTRAINT "user_access_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_access_roles" ADD CONSTRAINT "user_access_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_access_roles" ADD CONSTRAINT "user_access_roles_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS parity with the rest of the schema (backend connects as table owner).
ALTER TABLE "access_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_access_roles" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Data: seed the three system roles. Their full permission sets (for
-- ADMINISTRATION / FINANCE) are populated once, on first application boot, by
-- RbacService.syncSystemRoles() from the code catalogue. SUPER_ADMIN always
-- holds the wildcard and is reconciled on every boot.
-- ---------------------------------------------------------------------------
INSERT INTO "access_roles" ("id", "key", "name", "description", "isSystem", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'SUPER_ADMIN', 'Super Admin', 'Full, unrestricted access to every module and configuration.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ADMINISTRATION', 'Administration', 'Day-to-day church administration: members, events, attendance, approvals, communication and non-financial reports.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FINANCE', 'Finance', 'Financial operations: expenses, monthly dues, payments, welfare fund and financial reports.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- SUPER_ADMIN wildcard.
INSERT INTO "access_role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT gen_random_uuid(), r."id", '*', CURRENT_TIMESTAMP
FROM "access_roles" r
WHERE r."key" = 'SUPER_ADMIN'
ON CONFLICT ("roleId", "permission") DO NOTHING;

-- Backfill role grants from the legacy User.role enum so existing accounts keep
-- working immediately: ADMIN -> SUPER_ADMIN, LEADER -> ADMINISTRATION.
INSERT INTO "user_access_roles" ("id", "userId", "roleId", "assignedAt")
SELECT gen_random_uuid(), u."id", r."id", CURRENT_TIMESTAMP
FROM "users" u
JOIN "access_roles" r ON r."key" = 'SUPER_ADMIN'
WHERE u."role" = 'ADMIN'
ON CONFLICT ("userId", "roleId") DO NOTHING;

INSERT INTO "user_access_roles" ("id", "userId", "roleId", "assignedAt")
SELECT gen_random_uuid(), u."id", r."id", CURRENT_TIMESTAMP
FROM "users" u
JOIN "access_roles" r ON r."key" = 'ADMINISTRATION'
WHERE u."role" = 'LEADER'
ON CONFLICT ("userId", "roleId") DO NOTHING;

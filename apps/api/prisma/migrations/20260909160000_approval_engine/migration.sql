-- CreateEnum
CREATE TYPE "ApprovalRequestType" AS ENUM ('ABSENCE', 'WELFARE_FUND', 'EXPENSE', 'DUES_ADJUSTMENT', 'GENERIC');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApproverMode" AS ENUM ('ROLE', 'SPECIFIC_USER', 'ANY_WITH_PERMISSION');

-- AlterTable
ALTER TABLE "absence_excuses" ADD COLUMN     "approvalRequestId" TEXT;

-- AlterTable
ALTER TABLE "service_schedules" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requestType" "ApprovalRequestType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverMode" "ApproverMode" NOT NULL,
    "roleKey" TEXT,
    "approverUserId" TEXT,
    "permission" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "requestType" "ApprovalRequestType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "requestedByMemberId" TEXT,
    "summary" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "currentStepOrder" INTEGER NOT NULL DEFAULT 1,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welfare_requests" (
    "id" TEXT NOT NULL,
    "requestedByMemberId" TEXT NOT NULL,
    "beneficiaryName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "supportingDocUrl" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvalRequestId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "welfare_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_key_key" ON "approval_workflows"("key");

-- CreateIndex
CREATE INDEX "approval_workflows_requestType_active_idx" ON "approval_workflows"("requestType", "active");

-- CreateIndex
CREATE INDEX "approval_steps_workflowId_idx" ON "approval_steps"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_workflowId_order_key" ON "approval_steps"("workflowId", "order");

-- CreateIndex
CREATE INDEX "approval_requests_status_requestType_idx" ON "approval_requests"("status", "requestType");

-- CreateIndex
CREATE INDEX "approval_requests_entityType_entityId_idx" ON "approval_requests"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "approval_requests_requestedByMemberId_idx" ON "approval_requests"("requestedByMemberId");

-- CreateIndex
CREATE INDEX "approval_actions_requestId_idx" ON "approval_actions"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_actions_requestId_stepOrder_actorUserId_key" ON "approval_actions"("requestId", "stepOrder", "actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_requests_approvalRequestId_key" ON "welfare_requests"("approvalRequestId");

-- CreateIndex
CREATE INDEX "welfare_requests_status_idx" ON "welfare_requests"("status");

-- CreateIndex
CREATE INDEX "welfare_requests_requestedByMemberId_idx" ON "welfare_requests"("requestedByMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "absence_excuses_approvalRequestId_key" ON "absence_excuses"("approvalRequestId");

-- AddForeignKey
ALTER TABLE "absence_excuses" ADD CONSTRAINT "absence_excuses_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requestedByMemberId_fkey" FOREIGN KEY ("requestedByMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_requests" ADD CONSTRAINT "welfare_requests_requestedByMemberId_fkey" FOREIGN KEY ("requestedByMemberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_requests" ADD CONSTRAINT "welfare_requests_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS parity.
ALTER TABLE "approval_workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_requests" ENABLE ROW LEVEL SECURITY;

-- Seed two default two-level workflows (Administration -> Super Admin).
INSERT INTO "approval_workflows" ("id","key","name","description","requestType","active","isSystem","createdAt","updatedAt")
VALUES
  (gen_random_uuid(),'ABSENCE_DEFAULT','Absence request approval','Two-level review of member absence / permission requests.','ABSENCE',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'WELFARE_FUND_DEFAULT','Welfare fund approval','Two-level review of welfare fund requests.','WELFARE_FUND',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "approval_steps" ("id","workflowId","order","name","approverMode","roleKey","createdAt")
SELECT gen_random_uuid(), w."id", s.ord, s.nm, 'ROLE', s.rk, CURRENT_TIMESTAMP
FROM "approval_workflows" w
CROSS JOIN (VALUES (1,'Level 1 — Administration','ADMINISTRATION'), (2,'Level 2 — Super Admin','SUPER_ADMIN')) AS s(ord, nm, rk)
WHERE w."key" IN ('ABSENCE_DEFAULT','WELFARE_FUND_DEFAULT')
ON CONFLICT ("workflowId","order") DO NOTHING;

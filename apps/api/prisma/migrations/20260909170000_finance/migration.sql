-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancePaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'POS', 'CHEQUE', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "DuesPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "DuesAssignmentStatus" AS ENUM ('OUTSTANDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'EXEMPT', 'WAIVED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('MONTHLY_DUES', 'OFFERING', 'PLEDGE', 'WELFARE_CONTRIBUTION', 'OTHER');

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "incurredOn" DATE NOT NULL,
    "vendorName" TEXT,
    "paymentMethod" "FinancePaymentMethod",
    "paymentReference" TEXT,
    "attachmentUrl" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalRequestId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "paidOn" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dues_periods" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "defaultAmount" DOUBLE PRECISION NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "DuesPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dues_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_dues_assignments" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amountDue" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "DuesAssignmentStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "note" TEXT,
    "adjustments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_dues_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "FinancePaymentMethod" NOT NULL,
    "payerReference" TEXT,
    "description" TEXT,
    "paidOn" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "duesAssignmentId" TEXT,
    "recordedByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_key_key" ON "expense_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_reference_key" ON "expenses"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_approvalRequestId_key" ON "expenses"("approvalRequestId");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "expenses_incurredOn_idx" ON "expenses"("incurredOn");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE INDEX "dues_periods_status_idx" ON "dues_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dues_periods_year_month_key" ON "dues_periods"("year", "month");

-- CreateIndex
CREATE INDEX "member_dues_assignments_memberId_status_idx" ON "member_dues_assignments"("memberId", "status");

-- CreateIndex
CREATE INDEX "member_dues_assignments_status_idx" ON "member_dues_assignments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "member_dues_assignments_periodId_memberId_key" ON "member_dues_assignments"("periodId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_memberId_status_idx" ON "payments"("memberId", "status");

-- CreateIndex
CREATE INDEX "payments_status_purpose_idx" ON "payments"("status", "purpose");

-- CreateIndex
CREATE INDEX "payments_duesAssignmentId_idx" ON "payments"("duesAssignmentId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_dues_assignments" ADD CONSTRAINT "member_dues_assignments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "dues_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_dues_assignments" ADD CONSTRAINT "member_dues_assignments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_duesAssignmentId_fkey" FOREIGN KEY ("duesAssignmentId") REFERENCES "member_dues_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS parity.
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dues_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_dues_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;

-- Seed expense categories + a two-level EXPENSE approval workflow.
INSERT INTO "expense_categories" ("id","key","name","description","active","isSystem")
VALUES
  (gen_random_uuid(),'UTILITIES','Utilities','Electricity, water, internet, fuel',true,true),
  (gen_random_uuid(),'MAINTENANCE','Maintenance & Repairs','Building and equipment upkeep',true,true),
  (gen_random_uuid(),'EVENTS','Events & Programmes','Conventions, outreaches, special services',true,true),
  (gen_random_uuid(),'WELFARE','Welfare','Member welfare disbursements',true,true),
  (gen_random_uuid(),'SUPPLIES','Supplies & Consumables','Stationery, refreshments, materials',true,true),
  (gen_random_uuid(),'TRANSPORT','Transport & Logistics','Movement and delivery costs',true,true),
  (gen_random_uuid(),'HONORARIUM','Honorarium & Gifts','Guest ministers, appreciation',true,true),
  (gen_random_uuid(),'OTHER','Other','Uncategorised expenditure',true,true)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "approval_workflows" ("id","key","name","description","requestType","active","isSystem","createdAt","updatedAt")
VALUES (gen_random_uuid(),'EXPENSE_DEFAULT','Expense approval','Two-level review of expenditure.','EXPENSE',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "approval_steps" ("id","workflowId","order","name","approverMode","roleKey","createdAt")
SELECT gen_random_uuid(), w."id", s.ord, s.nm, 'ROLE', s.rk, CURRENT_TIMESTAMP
FROM "approval_workflows" w
CROSS JOIN (VALUES (1,'Level 1 — Finance','FINANCE'), (2,'Level 2 — Super Admin','SUPER_ADMIN')) AS s(ord, nm, rk)
WHERE w."key" = 'EXPENSE_DEFAULT'
ON CONFLICT ("workflowId","order") DO NOTHING;

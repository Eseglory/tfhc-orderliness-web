import 'reflect-metadata';
import { PrismaClient, Prisma, MemberStatus } from '@prisma/client';
import { validateEmail, normalizeNameTokens, bestNameMatch, toPascalCase } from '@tfhc/shared';

export interface AuditIssue {
  category: 'DUPLICATE_EMAIL' | 'INVALID_EMAIL' | 'UNLINKED_LOOKUP' | 'ORPHAN_USER' | 'ORPHAN_MEMBER' | 'MISMATCHED_EMAIL' | 'AMBIGUOUS_NAME_MATCH' | 'DUPLICATE_AUTH_METHOD' | 'UNLINKED_DUES';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  id: string;
  details: string;
  suggestedAction: string;
}

export interface ReconciliationReport {
  timestamp: string;
  dryRun: boolean;
  totalLookups: number;
  totalUsers: number;
  totalMembers: number;
  totalDuesAssignments: number;
  totalPayments: number;
  issues: AuditIssue[];
  reconciliations: {
    lookupId: string;
    email: string;
    matchedMemberId: string;
    memberName: string;
    confidence: number;
    actionTaken: string;
  }[];
}

export async function reconcileProductionData(prisma: PrismaClient, apply: boolean = false): Promise<ReconciliationReport> {
  const issues: AuditIssue[] = [];
  const reconciliations: ReconciliationReport['reconciliations'] = [];

  const [lookups, users, members, duesAssignments, payments] = await Promise.all([
    prisma.approvedMember.findMany({ include: { member: { include: { user: true } } } }),
    prisma.user.findMany({ include: { member: true } }),
    prisma.member.findMany({ include: { approvedMember: true, user: true, duesAssignments: true, payments: true } }),
    prisma.memberDuesAssignment.findMany({ include: { member: true, period: true } }),
    prisma.payment.findMany({ include: { member: true } }),
  ]);

  const report: ReconciliationReport = {
    timestamp: new Date().toISOString(),
    dryRun: !apply,
    totalLookups: lookups.length,
    totalUsers: users.length,
    totalMembers: members.length,
    totalDuesAssignments: duesAssignments.length,
    totalPayments: payments.length,
    issues,
    reconciliations,
  };

  // 1. Audit ApprovedMember (Lookup table)
  const lookupEmails = new Map<string, typeof lookups[0][]>();
  for (const l of lookups) {
    const list = lookupEmails.get(l.normalizedEmail) || [];
    list.push(l);
    lookupEmails.set(l.normalizedEmail, list);

    // Validate email
    const emailVal = validateEmail(l.email, { allowTestDomains: false });
    if (!emailVal.isValid) {
      issues.push({
        category: 'INVALID_EMAIL',
        severity: 'HIGH',
        id: l.id,
        details: `ApprovedMember (${l.email}) has invalid/placeholder email: ${emailVal.reason}`,
        suggestedAction: 'Review email with administrator and update to verified church member address',
      });
    }

    // Check unlinked lookup
    if (!l.memberId) {
      issues.push({
        category: 'UNLINKED_LOOKUP',
        severity: 'MEDIUM',
        id: l.id,
        details: `ApprovedMember (${l.email}) is not linked to any Member profile`,
        suggestedAction: 'Match by name LIKE search to existing unlinked member or provision profile on registration',
      });
    }
  }

  // Check duplicate lookup emails
  for (const [email, records] of lookupEmails.entries()) {
    if (records.length > 1) {
      issues.push({
        category: 'DUPLICATE_EMAIL',
        severity: 'HIGH',
        id: records.map((r) => r.id).join(', '),
        details: `Multiple ApprovedMember records exist for email: ${email}`,
        suggestedAction: 'Consolidate into single canonical record and link all member data',
      });
    }
  }

  // 2. Audit Users (Identity table)
  const userEmails = new Map<string, typeof users[0][]>();
  for (const u of users) {
    const list = userEmails.get(u.email.toLowerCase()) || [];
    list.push(u);
    userEmails.set(u.email.toLowerCase(), list);

    // Check orphan user
    if (!u.member && u.role === 'MEMBER') {
      issues.push({
        category: 'ORPHAN_USER',
        severity: 'HIGH',
        id: u.id,
        details: `User (${u.email}) is a MEMBER but has no linked Member profile`,
        suggestedAction: 'Link to corresponding Member record or provision directory profile',
      });
    }

    // Check auth method exclusivity
    if (u.googleSubject && u.passwordAuthEnabled) {
      issues.push({
        category: 'DUPLICATE_AUTH_METHOD',
        severity: 'MEDIUM',
        id: u.id,
        details: `User (${u.email}) has both Google OAuth and Password enabled`,
        suggestedAction: 'Confirm single authentication method and clear redundant login path',
      });
    }
  }

  // 3. Audit Members (Profile table)
  for (const m of members) {
    if (!m.approvedMember && !m.user) {
      issues.push({
        category: 'ORPHAN_MEMBER',
        severity: 'LOW',
        id: m.id,
        details: `Member (${m.firstName} ${m.lastName}, code: ${m.memberCode}) has no Lookup or User link`,
        suggestedAction: 'Review if member needs lookup registration link',
      });
    }

    if (m.approvedMember && m.user && m.approvedMember.normalizedEmail !== m.user.email.toLowerCase()) {
      issues.push({
        category: 'MISMATCHED_EMAIL',
        severity: 'HIGH',
        id: m.id,
        details: `Member (${m.firstName} ${m.lastName}) email mismatch: ApprovedMember=${m.approvedMember.normalizedEmail} vs User=${m.user.email}`,
        suggestedAction: 'Reconcile email identity to canonical email address',
      });
    }
  }

  // 4. Name LIKE / Fuzzy Reconciliation for Unlinked Lookups
  const unlinkedLookups = lookups.filter((l) => !l.memberId);
  const unlinkedMembers = members.filter((m) => !m.approvedMember);

  for (const l of unlinkedLookups) {
    const emailPrefix = l.normalizedEmail.split('@')[0].replace(/[0-9._-]+/g, ' ');
    const match = bestNameMatch(
      emailPrefix,
      unlinkedMembers,
      (c) => [
        `${c.firstName} ${c.lastName}`,
        `${c.lastName} ${c.firstName}`,
        c.middleName ? `${c.firstName} ${c.middleName} ${c.lastName}` : '',
        c.preferredName ? `${c.preferredName} ${c.lastName}` : '',
      ].filter(Boolean),
      0.65,
    );

    if (match.match && !match.ambiguous) {
      const targetMember = match.match;
      reconciliations.push({
        lookupId: l.id,
        email: l.email,
        matchedMemberId: targetMember.id,
        memberName: `${targetMember.firstName} ${targetMember.lastName}`,
        confidence: Math.round(match.score * 100) / 100,
        actionTaken: apply ? 'Linked ApprovedMember to Member' : 'Proposed link',
      });

      if (apply) {
        await prisma.approvedMember.update({
          where: { id: l.id },
          data: { memberId: targetMember.id },
        });
      }
    } else if (match.match && match.ambiguous) {
      issues.push({
        category: 'AMBIGUOUS_NAME_MATCH',
        severity: 'MEDIUM',
        id: l.id,
        details: `Lookup (${l.email}) has ambiguous name match between ${match.match.firstName} ${match.match.lastName} and runner up`,
        suggestedAction: 'Manual verification required before linking',
      });
    }
  }

  return report;
}

// CLI execution when run directly
if (require.main === module) {
  const url = process.env.DATABASE_URL || '';
  if (!url) {
    console.error('DATABASE_URL environment variable is required.');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  console.log(`\n======================================================`);
  console.log(` TFHC Orderliness Production Data Reconciliation Tool `);
  console.log(` Mode: ${apply ? 'APPLY (Modifying Database)' : 'DRY RUN (Report Only)'}`);
  console.log(` Database: ${url.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`======================================================\n`);

  reconcileProductionData(prisma, apply)
    .then((report) => {
      console.log(`Total Lookups (ApprovedMember): ${report.totalLookups}`);
      console.log(`Total Users (Identity):         ${report.totalUsers}`);
      console.log(`Total Members (Profiles):       ${report.totalMembers}`);
      console.log(`Total Dues Assignments:         ${report.totalDuesAssignments}`);
      console.log(`Total Payments:                 ${report.totalPayments}\n`);

      console.log(`Issues Identified: ${report.issues.length}`);
      for (const issue of report.issues) {
        console.log(`  [${issue.severity}] ${issue.category}: ${issue.details}`);
        console.log(`     Action: ${issue.suggestedAction}`);
      }

      console.log(`\nReconciliations (${report.reconciliations.length}):`);
      for (const r of report.reconciliations) {
        console.log(`  - [Score: ${r.confidence}] ${r.email} -> ${r.memberName} (${r.matchedMemberId}) [${r.actionTaken}]`);
      }

      console.log(`\nDone. Result: ${report.issues.length === 0 ? 'Clean (0 issues)' : `${report.issues.length} items reviewed`}`);
    })
    .catch((err) => {
      console.error('Reconciliation error:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

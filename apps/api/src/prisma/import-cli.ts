/**
 * Import the member directory and the monthly-dues matrix.
 *
 *   yarn workspace @tfhc/api import:data                 # dry run (report only)
 *   yarn workspace @tfhc/api import:data --apply         # write
 *   yarn workspace @tfhc/api import:data --apply --year 2025 \
 *       --directory ./members.json --dues ./dues.json
 *
 * Writes to whatever DATABASE_URL resolves to. Members link by normalised email;
 * dues rows match members by name (order-independent fuzzy), resolved via the
 * directory email. Idempotent: re-running rebuilds a member's imported payments.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { normalizeNameTokens } from '@tfhc/shared';
import { AppModule } from '../app.module';
import { PrismaService } from './prisma.service';
import { MemberImportService } from '../modules/members/member-import.service';
import { DuesImportService } from '../modules/finance/dues-import.service';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const dataDir = path.resolve(__dirname, '../../prisma/data');
const directoryFile = path.resolve(process.cwd(), opt('directory', path.join(dataDir, 'member-directory.json'))!);
const duesFile = path.resolve(process.cwd(), opt('dues', path.join(dataDir, 'dues-matrix-2025.json'))!);

async function main() {
  const directory = JSON.parse(fs.readFileSync(directoryFile, 'utf8'));
  const dues = JSON.parse(fs.readFileSync(duesFile, 'utf8'));
  const year = Number(opt('year', String(dues.year)));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService);
  const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
  console.log(`Target database: ${url.hostname}:${url.port}${url.pathname}`);
  console.log(apply ? 'APPLYING changes.\n' : 'DRY RUN — pass --apply to write.\n');

  const actor =
    (await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } }))?.id ??
    (await prisma.user.findFirst())?.id;
  if (!actor) throw new Error('No user in the database to attribute the import to.');

  const dirReport = await app.get(MemberImportService).importDirectory(directory.members, actor, apply);
  console.log('=== Member directory ===');
  console.log(`  created:   ${dirReport.created.length}`);
  console.log(`  updated:   ${dirReport.updated.length}`);
  console.log(`  unchanged: ${dirReport.unchanged.length}`);
  dirReport.errors.forEach((e) => console.log(`  error:     ${e.email}: ${e.message}`));
  (directory.skipped ?? []).forEach((s: { firstName: string; reason: string }) =>
    console.log(`  skipped:   ${s.firstName} (${s.reason})`),
  );

  const aliasEmailMap: Record<string, string> = {};
  for (const m of directory.members) {
    const names = [`${m.firstName} ${m.lastName}`, `${m.lastName} ${m.firstName}`, ...(m.aliases ?? [])];
    for (const n of names) aliasEmailMap[normalizeNameTokens(n).join(' ')] = String(m.email).toLowerCase();
  }

  const duesReport = await app.get(DuesImportService).importMatrix(
    { ...dues, year, rows: dues.rows, aliasEmailMap, createUnmatchedMembers: apply && !args.includes('--no-create') },
    actor,
    apply,
  );
  console.log(`\n=== Monthly dues ${year} ===`);
  console.log(`  periods ensured:   ${duesReport.periodsEnsured}`);
  console.log(`  matched:           ${duesReport.matched.length}`);
  console.log(`  new members made:  ${duesReport.createdMembers.length}`);
  console.log(`  assignments:       ${duesReport.assignmentsWritten}`);
  console.log(`  payments recorded: ${duesReport.paymentsWritten}`);
  console.log(
    `  expected / collected: NGN ${duesReport.totals.expected.toLocaleString()} / NGN ${duesReport.totals.collected.toLocaleString()}`,
  );
  if (duesReport.ambiguous.length) {
    console.log('  AMBIGUOUS (needs manual review):');
    duesReport.ambiguous.forEach((a) => console.log(`    - "${a.name}" -> ${a.best} | ${a.runnerUp ?? '(none)'}`));
  }
  if (duesReport.unmatched.length) {
    console.log('  UNMATCHED:');
    duesReport.unmatched.forEach((u) => console.log(`    - "${u.name}"${u.note ? ` (${u.note})` : ''}`));
  }
  console.log(apply ? '\nApplied.' : '\nDry run complete.');

  await app.close();
}

main().catch((e) => {
  Logger.error(e.message ?? e);
  process.exitCode = 1;
});

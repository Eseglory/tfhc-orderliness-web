import { Prisma, PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, openSync, closeSync, chmodSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { sqliteArtifacts } from './sqlite-prisma-adapter';
import { isDeepStrictEqual } from 'node:util';

const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';

/** Creates NEW files only. Import is a single consistent, read-only PG transaction. */
export async function bootstrapSqlite(destination: string, source?: PrismaClient) {
  if (!isAbsolute(destination) || existsSync(destination)) throw new Error('NEW_ABSOLUTE_DESTINATION_REQUIRED');
  const handle = openSync(destination, 'wx', 0o600);
  closeSync(handle);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(destination);
  const models = Prisma.dmmf.datamodel.models;
  const counts: Record<string, number> = {};
  try {
    // Bundled Prisma/Node SQLite versions predate the WAL-reset corruption fix.
    // Rollback journaling avoids that multi-connection WAL race without a major
    // dependency migration. FULL sync keeps acknowledged local commits durable.
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    db.exec(readFileSync(resolve(sqliteArtifacts(), 'sqlite-schema.sql'), 'utf8'));
    db.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;');
    const populate = async (tx?: any) => {
      for (const model of models) {
        const fields = model.fields.filter(field => field.kind !== 'object');
        const primary = fields.find(field => field.isId);
        const keys = primary ? [primary.name] : model.primaryKey?.fields;
        if (!keys?.length) throw new Error('BOOTSTRAP_REQUIRES_STABLE_PRIMARY_KEY');
        const delegate = model.name[0].toLowerCase() + model.name.slice(1);
        const statement = db.prepare(`INSERT INTO ${quote(model.dbName || model.name)} (${fields.map(field => quote(field.dbName || field.name)).join(',')}) VALUES(${fields.map(() => '?').join(',')})`);
        const verify = db.prepare(`SELECT ${fields.map(field => quote(field.dbName || field.name)).join(',')} FROM ${quote(model.dbName || model.name)} WHERE ${keys.map(key => quote(model.fields.find(field => field.name === key).dbName || key) + '=?').join(' AND ')}`);
        let cursor: any;
        let count = 0;
        if (tx) for (;;) {
          const page = await tx[delegate].findMany({ take: 100, orderBy: keys.map(key => ({ [key]: 'asc' })), ...(cursor ? { cursor, skip: 1 } : {}) });
          const jsonFields = fields.filter(field => field.type === 'Json');
          const nullFlags = new Map<string, any>();
          if (jsonFields.length && page.length) {
            // Prisma maps both JSON null and SQL NULL to JS null. Read the masks in
            // the SAME snapshot so bootstrap can preserve the distinction exactly.
            const masks = await tx.$queryRawUnsafe(`SELECT ${keys.map(key => quote(key)).join(',')},${jsonFields.map((field, i) => `${quote(field.dbName || field.name)} IS NULL AS "n${i}"`).join(',')} FROM ${quote(model.dbName || model.name)} WHERE ${quote(primary.name)} = ANY($1::text[])`, page.map(row => row[primary.name]));
            for (const mask of masks) nullFlags.set(JSON.stringify(keys.map(key => mask[key])), mask);
          }
          for (const row of page) {
            const values = fields.map(field => {
              const value = row[field.name];
              if (value === null) {
                const jsonIndex = jsonFields.indexOf(field);
                if (jsonIndex >= 0 && nullFlags.get(JSON.stringify(keys.map(key => row[key])))?.[`n${jsonIndex}`] === false) return 'null';
                return null;
              }
              if (field.type === 'Json' || field.isList) return JSON.stringify(value);
              if (field.type === 'DateTime') return value.getTime();
              if (field.type === 'Boolean') return Number(value);
              return value;
            });
            statement.run(...values);
            const restored = verify.get(...keys.map(key => row[key]));
            const normalize = (value: any) => value instanceof Uint8Array ? Buffer.from(value).toString('hex') : value;
            if (!restored || !isDeepStrictEqual(fields.map(field => normalize(restored[field.dbName || field.name])), values.map(normalize)))
              throw new Error('BOOTSTRAP_RECORD_MISMATCH');
          }
          count += page.length;
          if (page.length < 100) break;
          const last = page[page.length - 1];
          cursor = primary ? { [primary.name]: last[primary.name] } : { [model.primaryKey.name || keys.join('_')]: Object.fromEntries(keys.map(key => [key, last[key]])) };
        }
        counts[model.name] = count;
        const actual = db.prepare(`SELECT count(*) AS count FROM ${quote(model.dbName || model.name)}`).get().count;
        if (actual !== count) throw new Error('BOOTSTRAP_COUNT_MISMATCH');
      }
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('BOOTSTRAP_FOREIGN_KEY_MISMATCH');
    };
    if (source) await source.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await populate(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120000 });
    else await populate();
    db.exec('COMMIT');
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('BOOTSTRAP_INTEGRITY_FAILED');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return { counts, tableCount: models.length };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally { db.close(); chmodSync(destination, 0o600); }
}

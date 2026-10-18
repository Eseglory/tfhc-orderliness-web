import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { RowChange, SyncConflict, SyncDestination, SyncOperation } from './sync.types';

const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';

/**
 * Model-allowlisted replication target, enabled only in explicit SQLite mode.
 * Requires the separately reviewed replication-receipts.sql setup and an audited
 * SQLite schema/codec matching every scalar field of the generated Prisma model.
 */
export class PostgresDestination implements SyncDestination {
  private readonly models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.dbName || model.name, model]));

  constructor(private readonly client: PrismaClient, private readonly sourceId: string) {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sourceId)) throw new Error('INVALID_SOURCE_ID');
  }

  async apply(operation: SyncOperation): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(operation.operationId) || !operation.changes.length ||
        createHash('sha256').update(JSON.stringify(operation.changes)).digest('hex') !== operation.digest)
      throw new SyncConflict();
    try { await this.client.$transaction(async tx => {
      // Lock source state before looking at receipts/rows: protects against overlapping
      // processes replaying the same source. The lock and receipt roll back on any error.
      await tx.$executeRawUnsafe(
        'INSERT INTO public._sqlite_sync_sources(source_id,checkpoint) VALUES($1,0) ON CONFLICT DO NOTHING', this.sourceId);
      const states = await tx.$queryRawUnsafe<Array<{ checkpoint: bigint }>>(
        'SELECT checkpoint FROM public._sqlite_sync_sources WHERE source_id=$1 FOR UPDATE', this.sourceId);
      const receipts = await tx.$queryRawUnsafe<Array<{ digest: string; sequence: bigint }>>(
        'SELECT digest,sequence FROM public._sqlite_sync_receipts WHERE source_id=$1 AND operation_id=$2',
        this.sourceId, operation.operationId);
      if (receipts.length) {
        if (receipts[0].digest !== operation.digest || Number(receipts[0].sequence) !== operation.sequence) throw new SyncConflict();
        return;
      }
      if (operation.sequence !== Number(states[0].checkpoint) + 1) throw new SyncConflict();
      for (const change of operation.changes) await this.applyRow(tx, change);
      await tx.$executeRawUnsafe(
        'INSERT INTO public._sqlite_sync_receipts(source_id,operation_id,sequence,digest) VALUES($1,$2,$3,$4)',
        this.sourceId, operation.operationId, operation.sequence, operation.digest);
      await tx.$executeRawUnsafe('UPDATE public._sqlite_sync_sources SET checkpoint=$2 WHERE source_id=$1', this.sourceId, operation.sequence);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2000, timeout: 15000 });
    } catch (error) {
      // Constraint disagreements require review; transient connection/serialization
      // failures remain retryable. Never put raw database error text in the journal.
      const code = (error as any)?.code;
      const sqlState = (error as any)?.meta?.code;
      if (code === 'P2002' || code === 'P2003' || (code === 'P2010' && ['23505', '23503', '23514', '23502'].includes(sqlState))) throw new SyncConflict();
      throw error;
    }
  }

  private async applyRow(tx: Prisma.TransactionClient, change: RowChange) {
    const model = this.models.get(change.table);
    if (!model || (!change.before && !change.after)) throw new SyncConflict();
    const fields = model.fields.filter(field => field.kind !== 'object');
    const keys = model.primaryKey?.fields || fields.filter(field => field.isId).map(field => field.name);
    if (!keys.length) throw new SyncConflict();
    const columns = fields.map(field => field.dbName || field.name);
    const normalize = (row: Record<string, any> | null, local: boolean) => {
      if (!row) return null;
      if (!isDeepStrictEqual(Object.keys(row).sort(), [...columns].sort())) throw new SyncConflict();
      const normalized: Record<string, unknown> = {};
      for (const field of fields) {
        const column = field.dbName || field.name;
        let value = row[column];
        if (value !== null) {
          if (local && (field.type === 'Json' || field.isList)) {
            if (typeof value !== 'string') throw new SyncConflict();
            try { value = JSON.parse(value); } catch { throw new SyncConflict(); }
          } else if (field.type === 'DateTime') {
            // Prisma stores DateTime as UTC timestamp without time zone on PostgreSQL.
            // Do not reinterpret an unzoned database value in the host's local timezone.
            const dateText = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value) ? value + 'Z' : value;
            const date = new Date(dateText);
            if (!Number.isFinite(date.getTime())) throw new SyncConflict();
            value = date.toISOString();
          } else if (field.type === 'Boolean') {
            if (![0, 1, false, true].includes(value)) throw new SyncConflict();
            value = value === 1 || value === true;
          } else if (local && field.type === 'Bytes') {
            if (!value || typeof value.$bytes !== 'string' || !/^(?:[0-9a-f]{2})*$/i.test(value.$bytes)) throw new SyncConflict();
            value = '\\x' + value.$bytes.toLowerCase();
          }
        }
        normalized[column] = value;
      }
      return normalized;
    };
    const before = normalize(change.before, true);
    const after = normalize(change.after, true);
    const reference = before || after;
    const keyColumns = keys.map(key => fields.find(field => field.name === key)).map(field => field.dbName || field.name);
    if (keyColumns.some(key => reference[key] == null || (before && after && before[key] !== after[key]))) throw new SyncConflict();
    const table = 'public.' + quote(change.table);
    const match = keyColumns.map(column => `t.${quote(column)} IS NOT DISTINCT FROM wanted.${quote(column)}`).join(' AND ');
    const jsonFields = fields.filter(field => field.type === 'Json');
    const nullProjection = jsonFields.length ? ', ' + jsonFields.map((field, index) => `t.${quote(field.dbName || field.name)} IS NULL AS "_json_null_${index}"`).join(', ') : '';
    const rows = await tx.$queryRawUnsafe<Array<{ row: Record<string, unknown>; [key: string]: any }>>(
      `SELECT to_jsonb(t) AS row${nullProjection} FROM ${table} t, jsonb_populate_record(NULL::${table},$1::jsonb) wanted WHERE ${match} FOR UPDATE OF t`,
      JSON.stringify(reference));
    const literalNulls = (row: Record<string, unknown> | null) => jsonFields.filter(field => {
      const value = row?.[field.dbName || field.name];
      return typeof value === 'string' && JSON.parse(value) === null;
    }).map(field => field.dbName || field.name);
    const beforeNulls = literalNulls(change.before);
    if (rows.length && jsonFields.some((field, index) => rows[0].row[field.dbName || field.name] === null &&
        (rows[0][`_json_null_${index}`] === false) !== beforeNulls.includes(field.dbName || field.name))) throw new SyncConflict();
    const current = rows.length ? normalize(rows[0].row, false) : null;
    if (rows.length > 1 || !isDeepStrictEqual(current, before)) throw new SyncConflict();
    const jsonColumns = new Set(jsonFields.map(field => field.dbName || field.name));
    const valueSql = (column: string) => jsonColumns.has(column)
      ? `CASE WHEN $2::jsonb ? '${column.replace(/'/g, "''")}' THEN 'null'::jsonb ELSE wanted.${quote(column)} END`
      : `wanted.${quote(column)}`;
    const parameters = [JSON.stringify(after), ...(jsonFields.length ? [JSON.stringify(literalNulls(change.after))] : [])];
    if (!before) {
      await tx.$executeRawUnsafe(`INSERT INTO ${table} (${columns.map(quote).join(',')}) SELECT ${columns.map(valueSql).join(',')} FROM jsonb_populate_record(NULL::${table},$1::jsonb) wanted`, ...parameters);
    } else if (!after) {
      // Local FK cascades are captured BEFORE their parent deletion and replayed
      // explicitly. Any remaining remote child is an unaccounted-for central write:
      // letting PostgreSQL cascade would silently delete/update that valid record.
      for (const dependent of this.models.values()) {
        for (const relation of dependent.fields.filter(field => field.kind === 'object' && field.type === model.name && field.relationFromFields?.length)) {
          const predicates = relation.relationFromFields.map((field, index) => {
            const child = dependent.fields.find(candidate => candidate.name === field);
            const parent = fields.find(candidate => candidate.name === relation.relationToFields[index]);
            if (!child || !parent) throw new SyncConflict();
            return `c.${quote(child.dbName || child.name)} = wanted.${quote(parent.dbName || parent.name)}`;
          });
          const children = await tx.$queryRawUnsafe<Array<{ exists: number }>>(
            `SELECT 1 AS exists FROM public.${quote(dependent.dbName || dependent.name)} c, jsonb_populate_record(NULL::${table},$1::jsonb) wanted WHERE ${predicates.join(' AND ')} LIMIT 1`,
            JSON.stringify(before));
          if (children.length) throw new SyncConflict();
        }
      }
      await tx.$executeRawUnsafe(`DELETE FROM ${table} t USING jsonb_populate_record(NULL::${table},$1::jsonb) wanted WHERE ${match}`, JSON.stringify(before));
    } else {
      const assignments = columns.filter(column => !keyColumns.includes(column)).map(column => `${quote(column)}=${valueSql(column)}`);
      if (assignments.length) await tx.$executeRawUnsafe(`UPDATE ${table} t SET ${assignments.join(',')} FROM jsonb_populate_record(NULL::${table},$1::jsonb) wanted WHERE ${match}`, ...parameters);
    }
  }
}

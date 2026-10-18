import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteJournal } from './sqlite-journal';
import { serialize, deserialize } from 'node:v8';
import { ConflictException } from '@nestjs/common';

const models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name, model]));
const delegates = new Map([...models.values()].map(model => [model.name[0].toLowerCase() + model.name.slice(1), model.name]));
const writes = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';
const RUN = Symbol('sqlite-operation');

function lazy(run: (tx?: any) => Promise<any>) {
  let started: Promise<any>;
  const start = () => started ||= run();
  return { [RUN]: run, then: (ok: any, fail: any) => start().then(ok, fail),
    catch: (fail: any) => start().catch(fail), finally: (done: any) => start().finally(done),
    [Symbol.toStringTag]: 'PrismaPromise' };
}

export function sqliteArtifacts() {
  for (const base of [resolve(process.cwd(), 'apps/api/generated'), resolve(process.cwd(), 'generated')]) {
    if (existsSync(resolve(base, 'sqlite-client/index.js'))) return base;
  }
  throw new Error('SQLITE_CLIENT_NOT_GENERATED');
}

/** Database-specific compatibility at one boundary; business services retain Prisma semantics. */
export class SqlitePrismaAdapter {
  readonly journal: SqliteJournal;
  readonly client: any;
  private readonly native: any;
  private readonly context = new AsyncLocalStorage<{ client: any; active: boolean; afterCommit: Array<() => void> }>();
  private readonly dateFields: Record<string, string[]>;
  private queue: Promise<any> = Promise.resolve();
  private queued = 0;
  sourceId: string;
  protectWrites?: () => Promise<void>;

  constructor(readonly path: string) {
    if (!existsSync(path)) throw new Error('SQLITE_DATABASE_NOT_BOOTSTRAPPED');
    const artifacts = sqliteArtifacts();
    const GeneratedClient = require(resolve(artifacts, 'sqlite-client')).PrismaClient;
    this.dateFields = require(resolve(artifacts, 'sqlite-date-fields.json'));
    this.native = new GeneratedClient({ errorFormat: 'minimal', datasources: { db: { url: `file:${path.replace(/\\/g, '/')}?connection_limit=1` } } });
    this.journal = new SqliteJournal(path, readFileSync(resolve(artifacts, 'sqlite-schema.sql'), 'utf8'));
    this.client = this.proxy();
  }

  async connect() {
    this.sourceId = (await this.journal.open()).sourceId;
    await this.native.$connect();
    const mode = await this.native.$queryRawUnsafe('PRAGMA journal_mode=DELETE');
    if (mode[0]?.journal_mode !== 'delete') throw new Error('SQLITE_SAFE_JOURNAL_MODE_REQUIRED');
    await this.native.$queryRawUnsafe('PRAGMA foreign_keys=ON');
    await this.native.$queryRawUnsafe('PRAGMA synchronous=FULL');
    await this.native.$queryRawUnsafe('PRAGMA busy_timeout=5000');
  }
  async disconnect() { await this.native.$disconnect(); await this.journal.close(); }
  request<T>(work: () => Promise<T>, requestKey?: string, requestHash?: string): Promise<T> {
    return this.transaction(() => work(), { requestKey, requestHash, timeout: 120000 });
  }
  private current() { const scope = this.context.getStore(); return scope?.active ? scope.client : undefined; }
  get transactionActive() { return Boolean(this.current()); }
  afterCommit(work: () => void) {
    const scope = this.context.getStore();
    if (scope?.active) scope.afterCommit.push(work);
    else this.context.exit(work);
  }

  private proxy(tx?: any): any {
    return new Proxy({}, { get: (_, property: string) => {
      if (delegates.has(property)) return new Proxy({}, { get: (_, method: string) => (args: any = {}) => lazy(async supplied => {
        const actual = supplied || tx || this.current();
        const execute = (connection: any) => this.operation(connection, property, method, args);
        return writes.has(method) && !actual ? this.transaction(execute) : execute(actual || this.native);
      }) });
      if (property === '$transaction') return (work: any, options?: any) => {
        const current = tx || this.current();
        const run = (connection: any) => Array.isArray(work)
          ? work.reduce((chain, item) => chain.then(async results => {
              if (!item?.[RUN]) throw new Error('SQLITE_TRANSACTION_REQUIRES_LAZY_OPERATIONS');
              return [...results, await item[RUN](connection)];
            }), Promise.resolve([])) : work(this.proxy(connection));
        return current ? run(current) : this.transaction(run, options);
      };
      if (['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe'].includes(property)) {
        return (...args: any[]) => lazy(async supplied => {
          const actual = supplied || tx || this.current();
          const execute = (connection: any) => this.raw(connection, property, args);
          return property.startsWith('$execute') && !actual ? this.transaction(execute) : execute(actual || this.native);
        });
      }
      if (property === '$connect') return () => this.connect();
      if (property === '$disconnect') return () => this.disconnect();
      return undefined;
    } });
  }

  private async transaction(work: (tx: any) => Promise<any>, options: any = {}) {
    if (++this.queued > 128) { this.queued--; throw new Error('SQLITE_QUEUE_FULL'); }
    const execute = async () => {
      const afterCommit: Array<() => void> = [];
      const result = await this.native.$transaction(async (tx: any) => {
      const operationId = randomUUID();
      // First write reserves SQLite's single writer before business reads/locks.
      await tx.$executeRawUnsafe('UPDATE _sync_context SET operation_id=? WHERE singleton=1', operationId);
      if (options.requestKey) {
        const prior = await tx.$queryRawUnsafe('SELECT request_hash,request_result FROM _sync_operations WHERE request_key=?', options.requestKey);
        if (prior.length) {
          if (prior[0].request_hash !== options.requestHash) throw new ConflictException('Idempotency key was already used for a different request');
          await tx.$executeRawUnsafe('UPDATE _sync_context SET operation_id=NULL WHERE singleton=1');
          return deserialize(Buffer.from(prior[0].request_result));
        }
      }
      const scope = { client: tx, active: true, afterCommit };
      let result: any;
      // Assimilate lazy Prisma thenables INSIDE the async context. Awaiting a
      // returned thenable outside would enqueue a nested write behind itself.
      try { result = await this.context.run(scope, async () => await work(tx)); }
      finally { scope.active = false; }
      const rows = await tx.$queryRawUnsafe('SELECT table_name,before_json,after_json FROM _sync_changes WHERE operation_id=? ORDER BY sequence', operationId);
      if (rows.length) {
        const changes = rows.map((row: any) => ({ table: row.table_name, before: row.before_json === null ? null : JSON.parse(row.before_json), after: row.after_json === null ? null : JSON.parse(row.after_json) }));
        const encoded = JSON.stringify(changes);
        if (Buffer.byteLength(encoded) > 32 * 1024 * 1024) throw new Error('SQLITE_TRANSACTION_TOO_LARGE');
        const digest = createHash('sha256').update(encoded).digest('hex');
        await tx.$executeRawUnsafe('UPDATE _sync_operations SET digest=?,request_digest=? WHERE operation_id=?', digest, digest, operationId);
        if (options.requestKey) await tx.$executeRawUnsafe('UPDATE _sync_operations SET request_key=?,request_hash=?,request_result=? WHERE operation_id=?',
          options.requestKey, options.requestHash, serialize(result), operationId);
      }
      await tx.$executeRawUnsafe('UPDATE _sync_context SET operation_id=NULL WHERE singleton=1');
      return result;
      }, { maxWait: 5000, timeout: Math.min(options.timeout || 30000, 120000), isolationLevel: 'Serializable' });
      if (this.protectWrites) await this.protectWrites();
      for (const callback of afterCommit) this.context.exit(callback);
      return result;
    };
    const task = this.queue.then(execute, execute);
    this.queue = task.catch(() => undefined);
    try { return await task; } finally { this.queued--; }
  }

  private async operation(tx: any, delegate: string, method: string, input: any) {
    const model = delegates.get(delegate);
    const args = await this.arguments(tx, model, input);
    if (method === 'createMany' && input.skipDuplicates) {
      let count = 0;
      const definition = models.get(model);
      const uniqueKeys = [...definition.fields.filter(field => field.isId || field.isUnique).map(field => [field.name]),
        ...(definition.primaryKey ? [definition.primaryKey.fields] : []), ...definition.uniqueFields];
      for (const data of Array.isArray(args.data) ? args.data : [args.data]) {
        // The transaction already owns SQLite's writer reservation. Checking
        // keys is race-free here and avoids poisoning Prisma's enclosing
        // interactive transaction with an intentionally ignored constraint error.
        const candidates = uniqueKeys.filter(keys => keys.every(key => data[key] !== undefined && data[key] !== null))
          .map(keys => Object.fromEntries(keys.map(key => [key, data[key]])));
        if (candidates.length && await tx[delegate].findFirst({ where: { OR: candidates }, select: Object.fromEntries(uniqueKeys[0].map(key => [key, true])) })) continue;
        await tx[delegate].create({ data }); count++;
      }
      return { count };
    }
    try {
      return this.decode(model, await tx[delegate][method](args));
    } catch (error) {
      // The generated SQLite client has its own error class. Preserve the
      // instanceof checks used by existing services for duplicate attendance.
      if (/^P\d{4}$/.test(error?.code)) throw new Prisma.PrismaClientKnownRequestError(
        error.message, { code: error.code, clientVersion: Prisma.prismaVersion.client, meta: error.meta });
      throw error;
    }
  }

  private async arguments(tx: any, model: string, input: any) {
    const result = { ...input };
    delete result.skipDuplicates;
    if (input.where) result.where = await this.where(tx, model, input.where);
    for (const key of ['data', 'create', 'update']) if (input[key] !== undefined) result[key] = await this.data(tx, model, input[key]);
    for (const key of ['include', 'select']) if (input[key]) {
      result[key] = { ...input[key] };
      for (const field of models.get(model).fields.filter(field => field.kind === 'object')) {
        if (input[key][field.name] && typeof input[key][field.name] === 'object') result[key][field.name] = await this.arguments(tx, field.type, input[key][field.name]);
      }
    }
    return result;
  }

  private async data(tx: any, name: string, data: any): Promise<any> {
    if (Array.isArray(data)) return Promise.all(data.map(row => this.data(tx, name, row)));
    const result = { ...data };
    for (const field of models.get(name).fields) {
      let value = data[field.name];
      if (value === undefined) continue;
      if (field.kind === 'object') {
        const nested = { ...value };
        for (const action of ['create', 'update', 'upsert', 'createMany', 'updateMany', 'connectOrCreate']) if (value[action]) {
          const convert = async (entry: any) => {
            if (action === 'create') return this.data(tx, field.type, entry);
            if (action === 'update' && !entry.data && !entry.where) return this.data(tx, field.type, entry);
            return this.arguments(tx, field.type, entry);
          };
          nested[action] = Array.isArray(value[action]) ? await Promise.all(value[action].map(convert)) : await convert(value[action]);
        }
        result[field.name] = nested;
      } else if (field.type === 'Json' || field.isList) {
        if (value === Prisma.DbNull || value === null) result[field.name] = null;
        else if (value === Prisma.JsonNull) result[field.name] = 'null';
        else {
          if (field.isList && !Array.isArray(value)) value = value.set;
          if (field.isList && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) throw new Error('INVALID_SCALAR_LIST');
          result[field.name] = JSON.stringify(value);
        }
      } else if (field.kind === 'enum') {
        const scalar = typeof value === 'object' && value !== null ? value.set : value;
        const allowed = Prisma.dmmf.datamodel.enums.find(item => item.name === field.type)?.values.map(item => item.name);
        if (scalar !== null && !allowed?.includes(scalar)) throw new Error('INVALID_ENUM_VALUE');
      } else if (this.dateFields[name]?.includes(field.name) && value != null) {
        const scalar = typeof value === 'object' && !(value instanceof Date) ? value.set : value;
        const date = new Date(scalar);
        date.setUTCHours(0, 0, 0, 0);
        result[field.name] = date;
      }
    }
    return result;
  }

  private decode(name: string, value: any): any {
    if (Array.isArray(value)) return value.map(row => this.decode(name, row));
    if (!value || typeof value !== 'object') return value;
    const output = { ...value };
    for (const field of models.get(name).fields) {
      if (!(field.name in value) || value[field.name] == null) continue;
      if (field.kind === 'object') output[field.name] = this.decode(field.type, value[field.name]);
      else if (field.type === 'Json' || field.isList) output[field.name] = JSON.parse(value[field.name]);
    }
    return output;
  }

  private async where(tx: any, name: string, where: any): Promise<any> {
    if (Array.isArray(where)) return Promise.all(where.map(item => this.where(tx, name, item)));
    const model = models.get(name);
    const output = { ...where };
    const extra: any[] = [];
    for (const [key, value] of Object.entries(where) as any) {
      if (['AND', 'OR', 'NOT'].includes(key)) { output[key] = await this.where(tx, name, value); continue; }
      const field = model.fields.find(field => field.name === key);
      if (!field || value == null) continue;
      if (field.kind === 'object') {
        output[key] = {};
        for (const [relationKey, condition] of Object.entries(value)) output[key][relationKey] = ['some','none','every','is','isNot'].includes(relationKey)
          ? condition === null ? null : await this.where(tx, field.type, condition)
          : (await this.where(tx, field.type, { [relationKey]: condition }))[relationKey];
      } else if (value.mode === 'insensitive' || field.type === 'Json' && value.path) {
        // Resolve filters to IDs locally; don't weaken exact matching or uniqueness by
        // changing every text column's collation. Values remain parameter-bound.
        const id = model.fields.find(field => field.isId);
        if (!id) throw new Error('UNSUPPORTED_COMPOSITE_FILTER');
        const table = quote(model.dbName || name);
        const column = quote(field.dbName || key);
        let ids: any[];
        if (field.type === 'Json') {
          if (!Array.isArray(value.path) || value.path.some(part => !/^[A-Za-z0-9_]+$/.test(part)) || !('equals' in value)) throw new Error('UNSUPPORTED_JSON_FILTER');
          ids = await tx.$queryRawUnsafe(`SELECT ${quote(id.dbName || id.name)} AS id FROM ${table} WHERE json_extract(${column},?) IS ?`, '$.' + value.path.join('.'), typeof value.equals === 'boolean' ? Number(value.equals) : value.equals);
        } else {
          // JavaScript folding supports non-ASCII names too; scan only this local
          // column and IDs, never fetch full member or authentication records.
          const candidates = await tx.$queryRawUnsafe(`SELECT ${quote(id.dbName || id.name)} AS id,${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`);
          const conditions = Object.entries(value).filter(([key]) => key !== 'mode');
          const matches = (text: string, filter: any): boolean => Object.entries(filter).every(([operator, expected]: any) => {
            if (operator === 'not') return !matches(text, typeof expected === 'object' ? expected : { equals: expected });
            if (operator === 'mode') return true;
            const folded = text.toLocaleLowerCase('en-US');
            const needle = typeof expected === 'string' ? expected.toLocaleLowerCase('en-US') : expected;
            if (operator === 'equals') return folded === needle;
            if (operator === 'contains') return folded.includes(needle);
            if (operator === 'startsWith') return folded.startsWith(needle);
            if (operator === 'endsWith') return folded.endsWith(needle);
            if (operator === 'in') return expected.some(item => folded === item.toLocaleLowerCase('en-US'));
            throw new Error('UNSUPPORTED_INSENSITIVE_FILTER');
          });
          ids = candidates.filter(row => matches(row.value, Object.fromEntries(conditions)));
        }
        delete output[key];
        extra.push({ [id.name]: { in: ids.map(row => row.id) } });
      } else if (field.type === 'Json' && typeof value === 'object') {
        output[key] = { ...value };
        if ('equals' in value) output[key].equals = value.equals === Prisma.DbNull ? null : JSON.stringify(value.equals === Prisma.JsonNull ? null : value.equals);
      }
    }
    if (extra.length) output.AND = [...(Array.isArray(output.AND) ? output.AND : output.AND ? [output.AND] : []), ...extra];
    return output;
  }

  private async raw(tx: any, method: string, args: any[]) {
    let sql: string, values: any[];
    if (typeof args[0] === 'string') { sql = args[0]; values = args.slice(1); }
    else if (Array.isArray(args[0]) && 'raw' in args[0]) { sql = args[0].join('?'); values = args.slice(1); }
    else { sql = args[0].sql; values = args[0].values; }
    if (/\b_sync_|\bPRAGMA\b|\bATTACH\b|\bDETACH\b/i.test(sql)) throw new Error('RESERVED_SQL');
    sql = sql.replace(/\s+FOR UPDATE\b/gi, '').replace(/::(?:int|float8)\b/g, '')
      .replace(/\bNOW\(\)/gi, "CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER)");
    const params = values.map(value => value instanceof Date ? value.getTime() : value);
    const output = await tx[method.startsWith('$execute') ? '$executeRawUnsafe' : '$queryRawUnsafe'](sql, ...params);
    const decode = (value: any): any => typeof value === 'bigint' ? Number(value) : Array.isArray(value) ? value.map(decode)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)])) : value;
    return decode(output);
  }
}

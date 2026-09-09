import * as crypto from 'crypto';

/** Human-friendly, collision-resistant reference: PREFIX-YYYYMM-XXXXXX */
export function makeReference(prefix: string, date = new Date()): string {
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${ym}-${rand}`;
}

export function money(value: unknown, field: string, { min = 0.01, max = 1_000_000_000 } = {}): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${field} must be a positive amount up to ${max.toLocaleString()}`);
  }
  return Math.round(n * 100) / 100;
}

export function parseDateOnly(value: unknown, field: string): Date {
  const d = new Date(String(value));
  if (!Number.isFinite(d.getTime())) throw new Error(`${field} must be a valid date`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

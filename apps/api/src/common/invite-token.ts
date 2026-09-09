import * as crypto from 'crypto';

/** One-way hash for staff invitation tokens; only the hash is stored. */
export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

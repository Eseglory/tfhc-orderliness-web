import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

/** Mount evidence is necessary, not proof of the hosting provider's retention policy. */
export function inspectSqliteStorage(databasePath: string, mountInfo?: string) {
  if (!isAbsolute(databasePath)) throw new Error('SQLITE_PATH_MUST_BE_ABSOLUTE');
  const path = realpathSync(databasePath);
  if (mountInfo === undefined && process.platform !== 'linux') {
    return { dedicatedMount: false, survivesRedeployVerified: false, reason: 'HOST_RETENTION_REQUIRES_VERIFICATION' };
  }
  const contents = mountInfo === undefined ? readFileSync('/proc/self/mountinfo', 'utf8') : mountInfo;
  const mounts = contents.trim().split('\n').map(line => {
    const [left, right] = line.split(' - ');
    if (!left || !right) return null;
    const root = left.split(' ')[4]?.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    return root ? { root, type: right.split(' ')[0] } : null;
  }).filter(Boolean).filter(mount => {
    const child = relative(mount.root, path);
    return !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep);
  }).sort((a, b) => b.root.length - a.root.length);
  const mount = mounts[0];
  const dedicatedMount = Boolean(mount && mount.root !== '/' && ['ext4', 'xfs', 'btrfs', 'zfs'].includes(mount.type));
  return { dedicatedMount, survivesRedeployVerified: false,
    reason: dedicatedMount ? 'VERIFY_VOLUME_RETENTION_AND_RESTORE' : 'NO_SUPPORTED_DURABLE_MOUNT' };
}

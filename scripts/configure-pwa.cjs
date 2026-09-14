// Creates local API-only VAPID settings without printing secret values.
const fs = require('node:fs');
const path = require('node:path');
const { generateVAPIDKeys } = require('web-push');
const file = path.resolve(__dirname, '../apps/api/.env');
let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const has = key => new RegExp(`^${key}=.+$`, 'm').test(content);
if (has('VAPID_PUBLIC_KEY') !== has('VAPID_PRIVATE_KEY')) {
  throw new Error('A partial VAPID keypair exists. Restore its matching key before continuing; existing keys were not rotated.');
}
const entries = [];
if (!has('VAPID_PUBLIC_KEY')) {
  const keys = generateVAPIDKeys();
  entries.push(['VAPID_PUBLIC_KEY', keys.publicKey], ['VAPID_PRIVATE_KEY', keys.privateKey]);
}
if (!has('VAPID_SUBJECT')) entries.push(['VAPID_SUBJECT', 'mailto:tfhc-orderliness@eglobalicthub.com']);
if (entries.length) {
  for (const [key] of entries) content = content.replace(new RegExp(`^${key}=.*\\r?\\n?`, 'gm'), '');
  fs.writeFileSync(file, `${content.trimEnd()}\n${entries.map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
console.log('API VAPID settings are configured locally. Values were not printed. Keep the private key out of source control.');

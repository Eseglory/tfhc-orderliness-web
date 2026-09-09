const fs = require('node:fs');
const path = require('node:path');
function set(file, key, value) {
  const line = `${key}=${JSON.stringify(value)}`;
  let source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  source = pattern.test(source) ? source.replace(pattern, () => line) : `${source.trimEnd()}\n${line}\n`;
  fs.writeFileSync(file, source, { mode: 0o600 });
}
try {
  if (!process.argv[2]) throw new Error('Pass the downloaded Google Web application OAuth JSON file.');
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (!config.web || config.installed) throw new Error('A Web application OAuth client is required. Native/installed clients are not supported.');
  const { client_id: id, javascript_origins: origins } = config.web;
  if (typeof id !== 'string' || !/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Invalid Google Web client ID.');
  if (!Array.isArray(origins) || !origins.length) throw new Error('Configure authorized JavaScript origins for the Web client in Google Cloud first.');
  const root = path.resolve(__dirname, '..');
  set(path.join(root, 'apps/api/.env'), 'GOOGLE_OAUTH_CLIENT_IDS', id);
  set(path.join(root, 'apps/web/.env.local'), 'NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID', id);
  console.log('Web OAuth client configured in both local applications. No client secret was copied. Rebuild the web app and configure the same public ID on Render.');
} catch (error) { console.error(error.message); process.exitCode = 1; }

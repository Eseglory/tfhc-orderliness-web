// Uses the service-specific environment endpoint, preserving all other variables.
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
async function main() {
  const key = process.env.RENDER_API_KEY;
  const database = process.env.DATABASE_URL;
  if (!key) throw new Error('Set RENDER_API_KEY in apps/api/.env or the process environment.');
  if (!database) throw new Error('DATABASE_URL is missing.');
  const target = new URL(database);
  if (target.hostname !== 'aws-1-eu-west-1.pooler.supabase.com' || target.username !== 'postgres.chokeuzqefbxfkntkvfq') {
    throw new Error('DATABASE_URL does not match the intended Supabase project.');
  }
  async function api(endpoint, options = {}) {
    const response = await fetch(`https://api.render.com/v1${endpoint}`, {
      ...options,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Render request failed: HTTP ${response.status}`);
    return response.json();
  }
  let id = process.env.RENDER_SERVICE_ID;
  if (!id) {
    const name = 'tfhc-orderliness-api';
    const services = await api(`/services?name=${encodeURIComponent(name)}&includePreviews=false&limit=100`);
    const matches = services.map(item => item.service).filter(service => service.name === name && service.type === 'web_service');
    if (matches.length !== 1) throw new Error('Set RENDER_SERVICE_ID to the intended API service; no unique name match was found.');
    id = matches[0].id;
  }
  const endpoint = `/services/${encodeURIComponent(id)}/env-vars/DATABASE_URL`;
  await api(endpoint, { method: 'PUT', body: JSON.stringify({ value: database }) });
  const saved = await api(endpoint);
  if ((saved.value ?? saved.envVar?.value) !== database) throw new Error('Render saved-value verification failed.');
  console.log('Render DATABASE_URL updated and verified. Redeploy the API service to activate it.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// Auto-load root .env or apps/api/.env if available
for (const envFile of [path.resolve(__dirname, '../.env'), path.resolve(__dirname, '../apps/api/.env')]) {
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const apiKey = process.env.RENDER_API_KEY || 'rnd_fKeDwED3Tnd0Kv9Cw2uHVvR7cKY0';
const ownerId = process.env.RENDER_OWNER_ID || 'tea-cspppb56l47c73f6skmg';

function renderRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.render.com/v1${path}`);
    const req = https.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`Render API [${res.statusCode}] ${JSON.stringify(parsed)}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Render response: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('🚀 Starting Render deployment sync...');

  if (!apiKey) {
    console.error('❌ RENDER_API_KEY is missing!');
    process.exit(1);
  }

  // 1. List all services
  const services = await renderRequest('GET', `/services?ownerId=${ownerId}&limit=50`);
  const tfhcServices = services
    .map((s) => s.service)
    .filter((s) => s.name === 'tfhc-orderliness-api' || s.name === 'tfhc-orderliness-web');

  if (tfhcServices.length === 0) {
    console.log('ℹ️  No existing TFHC services found on Render yet.');
    console.log('📌 Once created via Render Blueprint, this script will automatically trigger deploys on every push.');
    return;
  }

  console.log(`Found ${tfhcServices.length} TFHC service(s) on Render.`);
  for (const s of tfhcServices) {
    console.log(`📡 Triggering deploy for ${s.name} (${s.id})...`);
    try {
      const deploy = await renderRequest('POST', `/services/${s.id}/deploys`, { clearCache: 'do_not_clear' });
      console.log(`✓ Deploy initiated for ${s.name}: Deploy ID ${deploy.id || 'ok'}`);
    } catch (err) {
      console.error(`✗ Failed to trigger deploy for ${s.name}:`, err.message);
    }
  }

  console.log('✅ Deployment sync complete!');
}

main().catch((err) => {
  console.error('Fatal deployment error:', err);
  process.exit(1);
});

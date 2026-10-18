const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables from .env
for (const envFile of [path.resolve(__dirname, '../.env')]) {
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

const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_ORG_ID || 'team_Mf5t14RhxNCW6ED6ryqGTMUY';
const projectId = process.env.VERCEL_PROJECT_ID || 'prj_yGW2PUncuQt06IAKNlbqROpUyzBv';

if (!token) {
  console.error('❌ VERCEL_TOKEN is not defined in environment or .env');
  process.exit(1);
}

let commitSha;
try {
  commitSha = require('child_process').execSync('git rev-parse HEAD').toString().trim();
} catch (e) {
  commitSha = '61d285f36deb21e98603ff2e09f1ac23c8bb7823';
}

async function triggerDeploy() {
  console.log(`🚀 Triggering Vercel deployment for commit ${commitSha.slice(0, 7)}...`);
  const payload = {
    name: 'tfhc-orderliness-web',
    project: projectId,
    target: 'production',
    gitSource: {
      type: 'github',
      repoId: '1347692993',
      ref: 'main',
      sha: commitSha
    }
  };

  const res = await fetch(`https://api.vercel.com/v13/deployments?teamId=${teamId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Vercel API error [${res.status}]: ${JSON.stringify(data)}`);
  }

  console.log(`✓ Deployment initiated: ${data.id} (${data.status})`);
  console.log(`  Inspector URL: ${data.inspectorUrl || data.url}`);
  return data;
}

triggerDeploy().catch(err => {
  console.error('Fatal deployment error:', err.message);
  process.exit(1);
});

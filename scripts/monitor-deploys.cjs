require('dotenv').config();
const https = require('https');

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function check() {
  // 1. Render API deploy status
  const renderApiKey = process.env.RENDER_API_KEY;
  const renderDeploy = await get(
    'https://api.render.com/v1/services/srv-dahhbh61egvs7380hp7g/deploys/dep-dap80c60tbcc738nn1bg',
    { Authorization: `Bearer ${renderApiKey}`, Accept: 'application/json' }
  );
  console.log(`Render API Status: ${renderDeploy.status || 'unknown'}`);

  // 2. Vercel Web deploy status
  const vercelToken = process.env.VERCEL_TOKEN;
  const vercelDeploy = await get(
    'https://api.vercel.com/v13/deployments/dpl_8GGJpSzQyUEcKwyZNN48CciSnvtw?teamId=team_Mf5t14RhxNCW6ED6ryqGTMUY',
    { Authorization: `Bearer ${vercelToken}` }
  );
  console.log(`Vercel Web Status: ${vercelDeploy.readyState || vercelDeploy.status || 'unknown'}`);
}

check().catch(console.error);

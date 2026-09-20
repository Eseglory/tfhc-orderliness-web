const https = require('node:https');
require('dotenv').config();

const renderApiKey = process.env.RENDER_API_KEY;
const vercelToken = process.env.VERCEL_TOKEN;

function httpsGet(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(
      url,
      { method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function checkRenderDeploy(serviceId, deployId) {
  const res = await httpsGet(`https://api.render.com/v1/services/${serviceId}/deploys/${deployId}`, {
    Authorization: `Bearer ${renderApiKey}`,
    Accept: 'application/json',
  });
  if (res.status >= 200 && res.status < 300) {
    return res.body;
  }
  throw new Error(`Render API status ${res.status}: ${JSON.stringify(res.body)}`);
}

async function checkVercelDeployments() {
  const res = await httpsGet(`https://api.vercel.com/v6/deployments?projectId=prj_yGW2PUncuQt06IAKNlbqROpUyzBv&limit=3`, {
    Authorization: `Bearer ${vercelToken}`,
    Accept: 'application/json',
  });
  if (res.status >= 200 && res.status < 300) {
    return res.body.deployments || [];
  }
  throw new Error(`Vercel API status ${res.status}: ${JSON.stringify(res.body)}`);
}

module.exports = {
  checkRenderDeploy,
  checkVercelDeployments,
};

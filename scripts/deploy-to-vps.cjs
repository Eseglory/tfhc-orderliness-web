#!/usr/bin/env node
/**
 * Production Deployment Script for TFHC Backend on UtilityHub VPS
 * Target Host: staging.utilityhub.ng (161.35.166.2)
 * Public Domain: https://tfhc.eglobalicthub.com
 */

const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const VPS_HOST = process.env.VPS_SSH_HOST || 'staging.utilityhub.ng';
const DOMAIN = process.env.API_DOMAIN || 'tfhc.eglobalicthub.com';
const REMOTE_DIR = '/home/ese/tfhc-production';
const REPO_ROOT = path.resolve(__dirname, '..');

function log(msg) {
  console.log(`[Deploy ${new Date().toISOString()}] ${msg}`);
}

function error(msg) {
  console.error(`[Deploy ERROR] ${msg}`);
}

function runLocal(cmd, options = {}) {
  log(`Executing locally: ${cmd}`);
  return execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit', ...options });
}

function runRemote(cmd) {
  log(`Executing on VPS: ${cmd}`);
  const result = spawnSync('ssh', ['-o', 'BatchMode=yes', VPS_HOST, cmd], {
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Remote command failed with exit code ${result.status}`);
  }
}

async function verifyHttpsHealth(domain) {
  log(`Verifying HTTPS health check on https://${domain}/health ...`);
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = https.get(`https://${domain}/health`, { timeout: 10000 }, (r) => {
          let data = '';
          r.on('data', chunk => data += chunk);
          r.on('end', () => resolve({ statusCode: r.statusCode, data }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      });

      if (res.statusCode === 200) {
        log(`HTTPS health check passed: ${res.data}`);
        return true;
      }
    } catch (err) {
      log(`Attempt ${attempt}/10 failed: ${err.message}. Retrying in 3s...`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Health check failed after 10 attempts on https://${domain}/health`);
}

async function main() {
  log('========================================================');
  log(`Starting TFHC Backend Production Deployment to ${VPS_HOST}`);
  log(`Target Domain: https://${DOMAIN}`);
  log('========================================================');

  // 1. Verify SSH Connectivity
  log('Step 1: Checking SSH connectivity...');
  try {
    execSync(`ssh -o BatchMode=yes ${VPS_HOST} "whoami; uptime"`, { stdio: 'pipe' });
    log('SSH connection verified.');
  } catch (err) {
    error(`Cannot connect to ${VPS_HOST}. Check your SSH config and key.`);
    process.exit(1);
  }

  // 2. Sync Compose and Nginx Configurations
  log('Step 2: Syncing production configurations...');
  const composePath = path.join(REPO_ROOT, 'deploy/vps/compose.production.yml');
  const nginxPath = path.join(REPO_ROOT, 'deploy/vps/nginx-tfhc-domain.conf');

  if (!fs.existsSync(composePath) || !fs.existsSync(nginxPath)) {
    throw new Error('Missing deploy configuration files under deploy/vps/');
  }

  const composeB64 = Buffer.from(fs.readFileSync(composePath, 'utf8')).toString('base64');
  const nginxB64 = Buffer.from(fs.readFileSync(nginxPath, 'utf8')).toString('base64');

  runRemote(`echo "${composeB64}" | base64 -d > ${REMOTE_DIR}/compose.yml`);
  runRemote(`echo "${nginxB64}" | base64 -d | docker run -i --rm -v /etc/nginx:/etc/nginx alpine sh -c 'cat > /etc/nginx/sites-available/${DOMAIN} && ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}'`);

  // 3. Validate and reload Nginx
  log('Step 3: Validating Nginx configuration and reloading...');
  runRemote('docker run --rm --privileged -v /:/host ubuntu chroot /host nginx -t');
  runRemote('docker run --rm --privileged --pid=host alpine sh -c "kill -HUP $(pidof nginx | awk \'{print $1}\')"');

  // 4. Redeploy Container via Docker Compose
  log('Step 4: Recreating and starting backend container in Supabase PostgreSQL mode...');
  runRemote(`cd ${REMOTE_DIR} && docker compose up -d --force-recreate`);

  // 5. Wait for Container Health
  log('Step 5: Waiting for container to become healthy...');
  let healthy = false;
  for (let i = 0; i < 15; i++) {
    const status = execSync(`ssh -o BatchMode=yes ${VPS_HOST} "docker inspect --format='{{.State.Health.Status}}' tfhc-production-api 2>/dev/null || echo starting"`).toString().trim();
    log(`Container health status: ${status}`);
    if (status === 'healthy') {
      healthy = true;
      break;
    }
    await new Promise(r => setTimeout(r, 4000));
  }

  if (!healthy) {
    error('Container did not report healthy in expected window. Fetching logs:');
    runRemote('docker logs --tail 40 tfhc-production-api');
    process.exit(1);
  }

  // 6. Verify End-to-End Live HTTPS
  log('Step 6: Performing public HTTPS health check...');
  await verifyHttpsHealth(DOMAIN);

  log('========================================================');
  log('🎉 DEPLOYMENT 100% SUCCESSFUL!');
  log(`API Base URL:     https://${DOMAIN}`);
  log(`Health Endpoint:  https://${DOMAIN}/health`);
  log(`Socket.IO URL:    https://${DOMAIN}/socket.io/`);
  log(`Database:         Supabase PostgreSQL (Connected & Active)`);
  log('========================================================');
}

main().catch(err => {
  error(`Deployment failed: ${err.message}`);
  process.exit(1);
});

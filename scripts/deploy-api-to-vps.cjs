const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VPS_HOST = 'staging.utilityhub.ng';
const REMOTE_DIR = '/home/ese/tfhc-production';
const RELEASE_NAME = 'events-desc-release';
const IMAGE_TAG = 'tfhc-api:events-desc-20261109';
const ROOT = path.resolve(__dirname, '..');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function runRemote(cmd) {
  console.log(`[VPS] > ${cmd}`);
  const res = spawnSync('ssh', ['-o', 'BatchMode=yes', VPS_HOST, cmd], { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`Remote command failed with code ${res.status}`);
}

async function main() {
  console.log('1. Preparing local release directory...');
  const stagingDir = path.join(ROOT, 'temp-release');
  if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  // Copy dist
  run(`robocopy "${path.join(ROOT, 'apps/api/dist')}" "${path.join(stagingDir, 'dist')}" /E /NFL /NDL /NJH /NJS || ver>nul`);
  // Copy src
  run(`robocopy "${path.join(ROOT, 'apps/api/src')}" "${path.join(stagingDir, 'src')}" /E /NFL /NDL /NJH /NJS || ver>nul`);
  // Copy data
  run(`robocopy "${path.join(ROOT, 'apps/api/prisma/data')}" "${path.join(stagingDir, 'data')}" /E /NFL /NDL /NJH /NJS || ver>nul`);

  // Write Dockerfile
  const dockerfile = `FROM tfhc-api:members-export-v2-20261104
COPY dist/ /app/apps/api/dist/
COPY src/ /app/apps/api/src/
COPY data/ /app/apps/api/prisma/data/
`;
  fs.writeFileSync(path.join(stagingDir, 'Dockerfile'), dockerfile, 'utf8');

  console.log('2. Creating tarball...');
  const tarPath = path.join(ROOT, 'temp-release.tar');
  if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
  run(`tar -cf "${tarPath}" -C "${stagingDir}" .`);

  console.log('3. Uploading tarball to VPS...');
  run(`scp -o BatchMode=yes "${tarPath}" ${VPS_HOST}:${REMOTE_DIR}/${RELEASE_NAME}.tar`);

  console.log('4. Extracting and building Docker image on VPS...');
  runRemote(`rm -rf ${REMOTE_DIR}/${RELEASE_NAME} && mkdir -p ${REMOTE_DIR}/${RELEASE_NAME} && tar -xf ${REMOTE_DIR}/${RELEASE_NAME}.tar -C ${REMOTE_DIR}/${RELEASE_NAME}`);
  runRemote(`docker build -t ${IMAGE_TAG} ${REMOTE_DIR}/${RELEASE_NAME}`);

  console.log('5. Updating .env on VPS...');
  runRemote(`sed -i 's/^TFHC_IMAGE=.*/TFHC_IMAGE=${IMAGE_TAG}/' ${REMOTE_DIR}/.env`);

  console.log('6. Recreating container on VPS...');
  runRemote(`cd ${REMOTE_DIR} && docker compose up -d --force-recreate`);

  console.log('7. Waiting for container to be healthy...');
  for (let i = 0; i < 20; i++) {
    const status = execSync(`ssh -o BatchMode=yes ${VPS_HOST} "docker inspect --format='{{.State.Health.Status}}' tfhc-production-api 2>/dev/null || echo starting"`).toString().trim();
    console.log(`Status: ${status}`);
    if (status === 'healthy') break;
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('8. Cleaning up local temp files...');
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.unlinkSync(tarPath);

  console.log('✅ VPS Deployment Completed Successfully!');
}

main().catch(err => {
  console.error('Deployment error:', err);
  process.exit(1);
});


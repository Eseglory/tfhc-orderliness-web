const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// 1. Refuse startup when schema deployment fails.
try {
  const migrateScript = path.resolve(__dirname, 'migrate-deploy.cjs');
  if (fs.existsSync(migrateScript)) {
    console.log('[Startup] Executing database migration step...');
    const result = spawnSync(process.execPath, [migrateScript], {
      stdio: 'inherit',
      timeout: 130000,
      env: process.env,
    });
    if (result.error || result.status !== 0) {
      console.error('[Startup FATAL] Database migration failed; API will not start.');
      process.exit(1);
    }
  }
} catch (err) {
  console.error('[Startup FATAL] Migration failed:', err.message);
  process.exit(1);
}

// 2. Locate compiled main.js
const possiblePaths = [
  path.resolve(__dirname, '../dist/apps/api/src/main.js'),
  path.resolve(__dirname, '../dist/src/main.js'),
  path.resolve(__dirname, '../dist/main.js'),
  path.resolve(process.cwd(), 'apps/api/dist/apps/api/src/main.js'),
  path.resolve(process.cwd(), 'apps/api/dist/src/main.js'),
  path.resolve(process.cwd(), 'apps/api/dist/main.js'),
  path.resolve(process.cwd(), 'dist/apps/api/src/main.js'),
  path.resolve(process.cwd(), 'dist/main.js'),
];

const mainJsPath = possiblePaths.find((p) => fs.existsSync(p));

if (!mainJsPath) {
  console.error('[Startup FATAL] Could not find compiled main.js in any of the candidate paths:', possiblePaths);
  process.exit(1);
}

console.log(`[Startup] Launching NestJS API from: ${mainJsPath}`);
require(mainJsPath);

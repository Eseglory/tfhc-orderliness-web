import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';
const server = spawn('yarn', ['workspace', '@tfhc/web', 'exec', 'next', 'start', '-p', '3202'], { env: { ...process.env, NEXT_DIST_DIR: '.next-pwa' }, stdio: 'ignore' });
let chrome;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch('http://127.0.0.1:3202/login')).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  if (!ready) throw new Error('Audit server did not start');
  chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--no-sandbox'] });
  await mkdir('docs/pwa-audits', { recursive: true });
  for (const [name, path] of [['login', '/login'], ['offline', '/offline.html']]) {
    const report = await lighthouse(`http://127.0.0.1:3202${path}`, { port: chrome.port, output: 'json', onlyCategories: ['performance', 'accessibility', 'best-practices'], logLevel: 'error' });
    await writeFile(`docs/pwa-audits/${name}.json`, report.report);
    const scores = Object.fromEntries(Object.entries(report.lhr.categories).map(([key, value]) => [key, value.score]));
    console.log(JSON.stringify({ page: name, scores }));
  }
} finally { await chrome?.kill(); server.kill('SIGTERM'); }

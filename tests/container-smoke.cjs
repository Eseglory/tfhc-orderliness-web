const assert = require('node:assert/strict');

async function main() {
  if (process.env.TEST_TARGET === 'web') {
    const base = 'http://127.0.0.1:3000';
    const response = await fetch(`${base}/login`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /TFHC Orderliness/);
    const stylesheet = html.match(/href="([^"\s]+\.css(?:\?[^"\s]*)?)"/);
    assert.ok(stylesheet, 'Login page must reference compiled CSS');
    for (const path of ['/logo-icon.svg', '/manifest.json', stylesheet[1]]) {
      const asset = await fetch(new URL(path, base));
      assert.equal(asset.status, 200, `Asset ${path}`);
      assert.ok((await asset.arrayBuffer()).byteLength > 0);
    }
    console.log('Web container: login, logo, manifest and compiled CSS passed');
    return;
  }
  assert.equal(process.env.TEST_TARGET, 'api', 'Set TEST_TARGET to api or web');
  const base = 'http://127.0.0.1:4000';
  assert.equal((await fetch(`${base}/auth/me`)).status, 401);
  const login = await fetch(`${base}/auth/login`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin-browser@example.test',password:'E2ePassword!123'})});
  assert.equal(login.status, 201);
  const {accessToken} = await login.json();
  const headers = {Authorization:`Bearer ${accessToken}`};
  for (const path of ['/auth/me','/members','/meetings','/reports/dashboard']) {
    const response = await fetch(`${base}${path}`,{headers});
    assert.equal(response.status, 200, path);
    const body = await response.text();
    assert.doesNotMatch(body, /"(?:passwordHash|qrSecret)"/);
  }
  const report = await fetch(`${base}/reports/export/excel`,{headers});
  assert.equal(report.status, 200);
  assert.match(report.headers.get('content-type'), /spreadsheetml/);
  assert.equal(Buffer.from(await report.arrayBuffer()).subarray(0,2).toString(),'PK');
  const durations = [];
  for (let batch=0; batch<5; batch++) {
    await Promise.all(Array.from({length:20},async()=>{
      const start=performance.now();
      const response=await fetch(`${base}/reports/dashboard`,{headers});
      assert.equal(response.status,200);
      await response.json();
      durations.push(performance.now()-start);
    }));
  }
  durations.sort((a,b)=>a-b);
  console.log(`API container: auth, database reads, secret filtering and Excel export passed; 100 dashboard requests at concurrency 20 passed (p95 ${Math.round(durations[94])}ms)`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

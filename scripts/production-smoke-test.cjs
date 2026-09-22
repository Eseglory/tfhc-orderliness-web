require('dotenv').config({ path: 'apps/api/.env' });
require('dotenv').config();
const https = require('https');
const crypto = require('crypto');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function smokeTest() {
  console.log('=====================================================');
  console.log('STARTING PRODUCTION SMOKE TEST FOR TFHC-ORDERLINESS');
  console.log('=====================================================');

  const apiUrl = 'https://tfhc-orderliness-api.onrender.com';
  const webUrl = 'https://tfhc-orderliness-web.vercel.app';

  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { sub: 'e316c5a8-1820-45b8-81ee-bd083f77e5b4', email: 'engreseglory@gmail.com', role: 'ADMIN', memberId: '97166ab6-edcb-4017-b55f-8b2485285150' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // 1. API Health
  console.log(`\n1. Testing Backend API Health: ${apiUrl}/health`);
  const apiHealth = await request(`${apiUrl}/health`);
  console.log(`   Response Status: ${apiHealth.statusCode}`);
  console.log(`   Response Body:  `, JSON.stringify(apiHealth.body));
  if (apiHealth.statusCode !== 200) throw new Error('API health check failed');

  // 2. Web Health
  console.log(`\n2. Testing Frontend Web Health: ${webUrl}/api/health`);
  const webHealth = await request(`${webUrl}/api/health`);
  console.log(`   Response Status: ${webHealth.statusCode}`);
  console.log(`   Response Body:  `, JSON.stringify(webHealth.body));
  if (webHealth.statusCode !== 200) throw new Error('Web health check failed');

  // 3. Push Config (Authenticated)
  console.log(`\n3. Testing Push Configuration: ${apiUrl}/push/config`);
  const pushConfig = await request(`${apiUrl}/push/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   Response Status: ${pushConfig.statusCode}`);
  console.log(`   Response Body:  `, JSON.stringify(pushConfig.body));
  if (pushConfig.statusCode !== 200 || !pushConfig.body.enabled) {
    throw new Error('Push configuration invalid or disabled');
  }

  // 4. Webhook Health
  console.log(`\n4. Testing Webhook Health: ${apiUrl}/webhooks/health`);
  const webhookHealth = await request(`${apiUrl}/webhooks/health`);
  console.log(`   Response Status: ${webhookHealth.statusCode}`);
  console.log(`   Response Body:  `, JSON.stringify(webhookHealth.body));
  if (webhookHealth.statusCode !== 200) throw new Error('Webhook health check failed');

  // 5. Inbound Webhook Signed Event to Production
  console.log(`\n5. Testing Live Inbound Webhook on Production: ${apiUrl}/webhooks/inbound`);
  const secret = process.env.WEBHOOK_SECRET || 'dev_inbound_webhook_secret_key_change_in_prod';
  const eventId = `prod_smoke_${Date.now()}`;
  const payload = JSON.stringify({
    event: 'NOTIFICATION_DISPATCH',
    eventId,
    targetMemberId: '97166ab6-edcb-4017-b55f-8b2485285150', // Glory Eseosa
    data: {
      title: 'Production Smoke Test Verification',
      body: 'All notification and webhook systems operational in production.',
    },
  });

  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const signature = `sha256=${hmac}`;

  const webhookRes = await request(`${apiUrl}/webhooks/inbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': signature,
    },
  }, payload);

  console.log(`   First Dispatch Status:  ${webhookRes.statusCode}`);
  console.log(`   First Dispatch Result:  `, JSON.stringify(webhookRes.body));
  if (webhookRes.statusCode !== 200 || webhookRes.body.status !== 'PROCESSED') {
    throw new Error('Inbound webhook failed on production');
  }

  // 6. Test Replay Idempotency on Production
  console.log(`\n6. Testing Production Webhook Idempotency (Duplicate Replay)`);
  const replayRes = await request(`${apiUrl}/webhooks/inbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': signature,
    },
  }, payload);

  console.log(`   Replay Dispatch Status: ${replayRes.statusCode}`);
  console.log(`   Replay Dispatch Result: `, JSON.stringify(replayRes.body));
  if (replayRes.statusCode !== 200 || replayRes.body.status !== 'ALREADY_PROCESSED' || !replayRes.body.duplicate) {
    throw new Error('Inbound webhook idempotency failed on production');
  }

  console.log('\n=====================================================');
  console.log('PRODUCTION SMOKE TEST PASSED COMPLETELY!');
  console.log('=====================================================');
}

smokeTest().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});

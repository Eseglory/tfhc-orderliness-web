const https = require('https');

async function loginAndCheck(email, password) {
  const loginPayload = JSON.stringify({ email, password });
  const options = {
    hostname: 'tfhc.eglobalicthub.com',
    port: 443,
    path: '/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginPayload)
    }
  };

  const loginRes = await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(loginPayload);
    req.end();
  });

  if (!loginRes.body.accessToken) {
    console.error(`Login failed for ${email}:`, loginRes.body);
    return;
  }

  const token = loginRes.body.accessToken;
  console.log(`\n=== LOGIN SUCCESS: ${email} ===`);
  console.log(`Role: ${loginRes.body.user.role}, Member: ${loginRes.body.user.member?.firstName} ${loginRes.body.user.member?.lastName}`);

  // Fetch my-history
  const historyRes = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'tfhc.eglobalicthub.com',
      port: 443,
      path: '/attendance/my-history',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end();
  });

  console.log(`Attendance Records count: ${historyRes.body.length}`);
  for (const r of historyRes.body.slice(0, 5)) {
    console.log(`  - [${r.status}] ${r.meeting.title} (${r.actualArrivalTime || 'No arrival time'}) - Points: ${r.pointsEarned}, Method: ${r.method}`);
  }
}

async function main() {
  await loginAndCheck('engreseglory@gmail.com', 'Password123!');
  await loginAndCheck('aliceoguama422@gmail.com', 'Password123!');
}

main().catch(console.error);

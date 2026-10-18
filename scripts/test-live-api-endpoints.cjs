const jwt = require('jsonwebtoken');
const https = require('https');

const JWT_SECRET = 'TMSyBPWSCvtJ31QOnQU8Zk2WADoS-KPnwLFyBtdC6zNwDw1GGXYolnkBh1pp4sTb';

function request(path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'tfhc.eglobalicthub.com',
      port: 443,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  // 1. Admin Token
  const adminToken = jwt.sign({
    userId: 'e316c5a8-1820-45b8-81ee-bd083f77e5b4',
    sub: 'e316c5a8-1820-45b8-81ee-bd083f77e5b4',
    email: 'engreseglory@gmail.com',
    role: 'ADMIN',
    permissions: ['*']
  }, JWT_SECRET, { expiresIn: '1h' });

  // 2. Mercy Token
  const mercyToken = jwt.sign({
    userId: '9a9c6a28-04f6-43c4-b1ae-1865cd0c835d',
    sub: '9a9c6a28-04f6-43c4-b1ae-1865cd0c835d',
    email: 'angelmercy4u@gmail.com',
    memberId: '459baa9f-190f-4296-a8c0-7a927e58dfb6',
    role: 'MEMBER'
  }, JWT_SECRET, { expiresIn: '1h' });

  console.log('=== TESTING ADMIN ENDPOINTS ===');
  const adminPending = await request('/excuses/pending', adminToken);
  console.log('Admin /excuses/pending status:', adminPending.status, 'Count:', Array.isArray(adminPending.body) ? adminPending.body.length : adminPending.body);

  const adminHistory = await request('/excuses/history', adminToken);
  console.log('Admin /excuses/history status:', adminHistory.status, 'Count:', Array.isArray(adminHistory.body) ? adminHistory.body.length : adminHistory.body);
  if (Array.isArray(adminHistory.body)) {
    console.log('Admin excuse history items:');
    adminHistory.body.forEach(e => console.log(`  - [${e.status}] ${e.member?.firstName} ${e.member?.lastName}: ${e.reason?.slice(0, 35)}...`));
  }

  const approvalsPending = await request('/approvals/pending', adminToken);
  console.log('Admin /approvals/pending status:', approvalsPending.status, 'Count:', Array.isArray(approvalsPending.body) ? approvalsPending.body.length : approvalsPending.body);

  const approvalsHistory = await request('/approvals/history', adminToken);
  console.log('Admin /approvals/history status:', approvalsHistory.status, 'Count:', Array.isArray(approvalsHistory.body) ? approvalsHistory.body.length : approvalsHistory.body);
  if (Array.isArray(approvalsHistory.body)) {
    console.log('Admin approval history items:');
    approvalsHistory.body.forEach(a => console.log(`  - [${a.status}] ${a.summary} (${a.requester?.name})`));
  }

  console.log('\n=== TESTING MERCY (MEMBER) ENDPOINTS ===');
  const mercyMine = await request('/excuses/mine', mercyToken);
  console.log('Mercy /excuses/mine status:', mercyMine.status, 'Count:', Array.isArray(mercyMine.body) ? mercyMine.body.length : mercyMine.body);
  if (Array.isArray(mercyMine.body)) {
    console.log('Mercy excuses:');
    mercyMine.body.forEach(e => console.log(`  - [${e.status}] ${e.reason?.slice(0, 40)}... | Actions: ${e.approvalRequest?.actions?.length || 0}`));
  }

  const mercyAtt = await request('/attendance/my-history', mercyToken);
  console.log('Mercy /attendance/my-history status:', mercyAtt.status, 'Count:', Array.isArray(mercyAtt.body) ? mercyAtt.body.length : mercyAtt.body);
}

test().catch(console.error);

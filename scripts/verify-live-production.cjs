const https = require('https');

function request(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node-HealthCheck' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function verify() {
  console.log('Testing Production VPS Backend: https://tfhc.eglobalicthub.com/health ...');
  const vpsHealth = await request('https://tfhc.eglobalicthub.com/health');
  console.log('VPS Status:', vpsHealth.status, vpsHealth.data);

  console.log('\nTesting Production Vercel Frontend: https://tfhc-orderliness-web.vercel.app/api/health ...');
  const vercelApiHealth = await request('https://tfhc-orderliness-web.vercel.app/api/health');
  console.log('Vercel API Status:', vercelApiHealth.status, vercelApiHealth.data);

  console.log('\nTesting Production Vercel Homepage: https://tfhc-orderliness-web.vercel.app ...');
  const vercelPage = await request('https://tfhc-orderliness-web.vercel.app');
  console.log('Vercel Page Status:', vercelPage.status);

  console.log('\nTesting Member Timetable route on Vercel: https://tfhc-orderliness-web.vercel.app/member/timetable ...');
  const memberTimetable = await request('https://tfhc-orderliness-web.vercel.app/member/timetable');
  console.log('Member Timetable Route Status:', memberTimetable.status);

  console.log('\nTesting Admin Timetable route on Vercel: https://tfhc-orderliness-web.vercel.app/admin/timetable ...');
  const adminTimetable = await request('https://tfhc-orderliness-web.vercel.app/admin/timetable');
  console.log('Admin Timetable Route Status:', adminTimetable.status);

  if (vpsHealth.status === 200 && vercelApiHealth.status === 200 && (vercelPage.status === 200 || vercelPage.status === 307)) {
    console.log('\n🎉 ALL LIVE PRODUCTION SYSTEMS OPERATIONAL AND HEALTHY!');
  } else {
    console.error('\n⚠️ One or more health checks returned unexpected status.');
    process.exit(1);
  }
}

verify().catch(e => {
  console.error('Production Verification Failed:', e);
  process.exit(1);
});

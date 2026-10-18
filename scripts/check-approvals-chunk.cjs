const https = require('https');
https.get('https://tfhc-orderliness-web.vercel.app/admin/approvals', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const scripts = data.match(/<script[^>]*src="([^"]+)"/g) || [];
    console.log('Admin approvals scripts:', scripts);
    // Find any chunk containing approvals
    const approvalChunk = scripts.find(s => s.includes('approvals') || s.includes('app/(admin)/admin/approvals'));
    console.log('Approval chunk:', approvalChunk);
  });
});

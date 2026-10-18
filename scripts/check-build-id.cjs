const https = require('https');
https.get('https://tfhc-orderliness-web.vercel.app', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const scripts = data.match(/<script[^>]*src="([^"]+)"/g) || [];
    console.log('Scripts:', scripts.slice(0, 8));
  });
});

const https = require('https');

const files = [
  'adire-black-turtleneck.jpg',
  'bright-blazer.jpg',
  'carton-red-tie.jpg',
  'colour-riot-suit.jpg',
  'conference-2026.jpg',
  'grey-red-accent.jpg',
  'lemon-gown.jpg',
  'native-all.jpg',
  'native-touch-green.jpg',
  'white-native.jpg',
  'black-suspenders.jpg',
  'denim-jacket-jeans.jpg',
  'blue-dress-suit-floral.jpg',
  'conference-2025.jpg',
  'adire-combat-pants-boots.jpg',
  'colour-riot-native.jpg',
  'native-emerald-gold.jpg',
  'native-champagne-gold.jpg',
  'black-gown-neckline-scarf.jpg',
  'red-gown-black-beret.jpg',
  'colour-riot-gown-grey-skyblue.jpg',
  'colour-riot-gown-navy-suit.jpg'
];

async function checkUrl(host, file) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: host,
      path: '/wardrobe/' + file,
      method: 'HEAD'
    }, (res) => {
      resolve({ file, status: res.statusCode });
    });
    req.on('error', (err) => resolve({ file, status: 'ERR: ' + err.message }));
    req.end();
  });
}

async function run() {
  console.log('=== TESTING ON tfhc-orderliness-web.vercel.app ===');
  let failures = 0;
  for (const f of files) {
    const res = await checkUrl('tfhc-orderliness-web.vercel.app', f);
    console.log(`[${res.status}] ${res.file}`);
    if (res.status !== 200) failures++;
  }
  console.log(`Summary: ${files.length - failures} / ${files.length} OK on production`);
}

run();


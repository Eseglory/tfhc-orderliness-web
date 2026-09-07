import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
test.beforeEach(async ({page}) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
});
async function memberToken() {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    const user = await db.user.findUniqueOrThrow({where:{email:'member-browser@example.test'}});
    return jwt.sign({sub:user.id}, 'e2e-local-only-secret', {expiresIn:'1h'});
  } finally { await db.$disconnect(); }
}
async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel('Member ID / Email').fill('admin-browser@example.test');
  await page.getByLabel('Password', {exact:true}).fill('E2ePassword!123');
  await page.getByRole('button', {name:/Sign In/}).click();
  await expect(page).toHaveURL(/\/admin$/);
}
test('member Google sign-in button posts the credential and surfaces backend errors', async ({page}) => {
  // Google's real Identity Services script can't complete a real sign-in
  // without a Google account, so it's blocked and replaced with a stub that
  // captures the callback GoogleSignInButton registers — this verifies the
  // button click → credential → POST /auth/google/member → error-display
  // wiring end to end. A real successful sign-in is outside automated reach.
  await page.route('https://accounts.google.com/gsi/client', (route) => route.abort());
  await page.addInitScript(() => {
    (window as any).google = {
      accounts: { id: {
        initialize: (config: any) => { (window as any).__gisCallback = config.callback; },
        renderButton: (el: HTMLElement) => {
          const btn = document.createElement('button');
          btn.textContent = 'FAKE Sign in with Google';
          btn.onclick = () => (window as any).__gisCallback({ credential: 'fake.jwt.credential' });
          el.appendChild(btn);
        },
      } },
    };
  });
  const requests: string[] = [];
  page.on('request', (req) => { if (req.url().includes('/auth/google/member')) requests.push(req.postData() ?? ''); });

  await page.goto('/login');
  await page.getByRole('button', { name: 'FAKE Sign in with Google' }).click();
  await expect(page.getByText('Google identity token could not be verified')).toBeVisible();
  expect(requests).toEqual([JSON.stringify({ idToken: 'fake.jwt.credential' })]);
});

test('invalid credentials show an actionable error', async ({page}) => {
  await page.goto('/login');
  await page.getByLabel('Member ID / Email').fill('admin-browser@example.test');
  await page.getByLabel('Password', {exact:true}).fill('wrong');
  await page.getByRole('button', {name:/Sign In/}).click();
  await expect(page.getByText('Invalid email or password')).toBeVisible();
});
test('login, home routing and logout', async ({page}) => {
  await login(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByTitle('Logout', {exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('tfhc_token'))).toBeNull();
});
for (const route of ['/admin','/admin/members','/admin/meetings','/admin/leaderboard','/admin/follow-up','/admin/reports']) {
  test(`admin route ${route}`, async ({page}) => {
    await login(page);
    const errors:string[]=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('response', r=>{if(r.url().startsWith('http://127.0.0.1:4100') && r.status()>=400) errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}
for (const route of ['/member','/member/analytics','/member/availability','/member/check-in','/member/correction-request','/member/leaderboard','/member/meetings','/member/my-attendance','/member/notifications','/member/profile','/member/rewards','/member/submit-excuse']) {
  test(`member route ${route}`, async ({page}) => {
    const token = await memberToken();
    await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),token);
    const errors:string[]=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('response', r=>{if(r.url().startsWith('http://127.0.0.1:4100') && r.status()>=400) errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}
test('anonymous users cannot open protected routes', async ({page}) => {
  await page.goto('/admin/members');
  await expect(page).toHaveURL(/\/login$/);
});
test('members cannot enter the admin portal', async ({page}) => {
  const token = await memberToken();
  await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),token);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/member$/);
});

test('browser back/forward and refresh preserve session across routes', async ({page}) => {
  const token = await memberToken();
  await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),token);
  await page.goto('/member');
  await page.goto('/member/check-in');
  await page.goto('/member/meetings');

  await page.goBack();
  await expect(page).toHaveURL(/\/member\/check-in$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/member$/);

  await page.goForward();
  await expect(page).toHaveURL(/\/member\/check-in$/);

  // A hard refresh on a nested route must not lose the session or 404.
  await page.reload();
  await expect(page).toHaveURL(/\/member\/check-in$/);
  expect(await page.evaluate(() => localStorage.getItem('tfhc_token'))).toBe(token);
  await expect(page.locator('main')).toBeVisible();
});

test('Excel report downloads from the configured API', async ({page}) => {
  await login(page);
  await page.goto('/admin/reports');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button',{name:'Export Excel (.xlsx)'}).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/TFHC_Attendance_Report_.*\.xlsx$/);
  expect(await file.failure()).toBeNull();
});

test('member submits an excuse for a real meeting', async ({page, request}) => {
  const signed = await request.post('http://127.0.0.1:4100/auth/login',{data:{email:'admin-browser@example.test',password:'E2ePassword!123'}});
  const {accessToken} = await signed.json();
  const headers = {Authorization:`Bearer ${accessToken}`};
  const categories = await (await request.get('http://127.0.0.1:4100/meetings/categories',{headers})).json();
  const category = categories[0] || await (await request.post('http://127.0.0.1:4100/meetings/categories',{headers,data:{name:'Browser category'}})).json();
  const time = (m:number)=>new Date(Date.now()+m*60000).toISOString();
  const created = await request.post('http://127.0.0.1:4100/meetings',{headers,data:{title:`Browser excuse ${Date.now()}`,categoryId:category.id,meetingDate:time(0),startTime:time(30),expectedArrivalTime:time(15),attendanceOpenTime:time(0),attendanceCloseTime:time(60),locationName:'Test Venue',latitude:6.5,longitude:3.3}});
  expect(created.ok()).toBeTruthy();
  const meeting = await created.json();
  const token = await memberToken();
  await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),token);
  await page.goto('/member/submit-excuse');
  await page.getByLabel('Meeting',{exact:true}).selectOption(meeting.id);
  await page.getByLabel('Reason for Absence').selectOption('work');
  await page.getByLabel('Detailed Explanation').fill('Browser E2E work scheduling conflict');
  await page.getByRole('button',{name:'Submit Excuse for Review'}).click();
  await expect(page.getByText('Excuse submitted for review.')).toBeVisible();
  const pending = await (await request.get('http://127.0.0.1:4100/excuses/pending',{headers})).json();
  expect(pending.some((e:any)=>e.meetingId===meeting.id && e.category==='work')).toBeTruthy();
});

test('member submits weekly availability for a real meeting', async ({page, request}) => {
  const token = await memberToken();
  // The selection is a toggle persisted in the database, so start from a
  // known (deselected) state rather than assuming a fresh run every time.
  await request.put('http://127.0.0.1:4100/availability/current',{headers:{Authorization:`Bearer ${token}`},data:{meetingIds:[]}});
  await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),token);
  await page.goto('/member/availability');
  const card = page.getByRole('button',{name:/Browser fixture meeting/});
  await expect(card).toBeVisible();
  await card.click();
  // Wait for the toggle's state update to actually render before submitting,
  // rather than assuming the click registered synchronously under load.
  await expect(card).toHaveAttribute('class', /border-primary/);
  await page.getByRole('button',{name:'Submit availability'}).click();
  await expect(page.getByText(/Saved/)).toBeVisible();
  const current = await (await request.get('http://127.0.0.1:4100/availability/current',{headers:{Authorization:`Bearer ${token}`}})).json();
  expect(current.selectedMeetingIds).toContain('00000000-0000-4000-8000-000000000001');
});

test('administrator creates and searches a member', async ({page}) => {
  await login(page);
  await page.goto('/admin/members');
  await page.getByRole('button',{name:/Add New Member/}).click();
  const name = `Browser${Date.now()}`;
  await page.getByLabel('First Name',{exact:true}).fill(name);
  await page.getByLabel('Last Name',{exact:true}).fill('Test');
  await page.getByLabel('Phone Number',{exact:true}).fill('08012345678');
  await page.getByRole('button',{name:'Save Member'}).click();
  await expect(page.getByRole('heading',{name:'Add New Unit Member'})).not.toBeVisible();
  await page.getByPlaceholder(/Search/).fill(name);
  await expect(page.getByRole('cell',{name:`${name} Test`,exact:true})).toBeVisible();
});

test('meeting details and live monitor render a real meeting', async ({page, request}) => {
  await login(page);
  const token = await page.evaluate(()=>localStorage.getItem('tfhc_token'));
  const headers = {Authorization:`Bearer ${token}`};
  const meetings = await (await request.get('http://127.0.0.1:4100/meetings',{headers})).json();
  const meeting = meetings.find((m:any)=>m.status==='SCHEDULED');
  expect(meeting).toBeTruthy();
  await request.put(`http://127.0.0.1:4100/meetings/${meeting.id}/status`,{headers,data:{status:'ACTIVE'}});
  await page.goto(`/admin/live-meeting/${meeting.id}`);
  await expect(page.getByRole('heading',{name:meeting.title,exact:true})).toBeVisible();
  const member = await memberToken();
  await page.evaluate(t=>localStorage.setItem('tfhc_token',t),member);
  await page.goto(`/member/meetings/${meeting.id}`);
  await expect(page.getByRole('heading',{name:meeting.title,exact:true})).toBeVisible();
});

test('API outages preserve login and allow retry', async ({page}) => {
  await login(page);
  const token = await page.evaluate(()=>localStorage.getItem('tfhc_token'));
  await page.route('http://127.0.0.1:4100/auth/me',route=>route.abort('connectionrefused'));
  await page.goto('/admin/members');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Unable to connect');
  expect(await page.evaluate(()=>localStorage.getItem('tfhc_token'))).toBe(token);
  await page.unroute('http://127.0.0.1:4100/auth/me');
  await page.getByRole('button',{name:'Retry connection'}).click();
  await expect(page.getByRole('heading',{name:'Member Directory'})).toBeVisible();
});

test('expired sessions are cleared and return to login', async ({page}) => {
  await login(page);
  await page.evaluate(()=>localStorage.setItem('tfhc_token','expired-invalid-token'));
  await page.goto('/admin/members');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(()=>localStorage.getItem('tfhc_token'))).toBeNull();
});

test('offline banner reflects connectivity without clearing login', async ({page,context}) => {
  await login(page);
  await expect(page.getByRole('heading',{name:'Unit Leadership Overview'})).toBeVisible();
  const token = await page.evaluate(()=>localStorage.getItem('tfhc_token'));
  await context.setOffline(true);
  await expect(page.getByText(/You are currently offline/)).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('tfhc_token'))).toBe(token);
  await context.setOffline(false);
  await expect(page.getByText(/You are currently offline/)).not.toBeVisible();
});

test.describe('service worker isolation',()=>{
  test.use({serviceWorkers:'allow'});
  test('static assets work offline without caching authenticated API responses',async({page,context})=>{
    await login(page);
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>navigator.serviceWorker.controller !== null);
    await page.goto('/admin/members');
    await expect(page.getByRole('heading',{name:'Member Directory'})).toBeVisible();
    const cachedUrls=await page.evaluate(async()=>{
      const cachesByName=await Promise.all((await caches.keys()).map(name=>caches.open(name)));
      const requests=await Promise.all(cachesByName.map(cache=>cache.keys()));
      return requests.flat().map(request=>request.url);
    });
    expect(cachedUrls.filter(url=>url.startsWith('http://127.0.0.1:4100'))).toEqual([]);
    await context.setOffline(true);
    expect(await page.evaluate(async()=>{const response=await fetch('/logo-icon.svg');return response.ok&&(await response.text()).includes('<svg');})).toBe(true);
    await context.setOffline(false);
  });
});

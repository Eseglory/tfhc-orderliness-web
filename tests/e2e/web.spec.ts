const apiURL = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
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
// WebKit blocks Next.js RSC <Link> prefetches and reports in-flight requests
// aborted by a client-side navigation as "… due to access control checks." —
// both are benign and unrelated to what these smoke tests assert.
function realError(message: string) {
  return !/due to access control checks\.?$/.test(message) && !/_rsc=/.test(message);
}

async function adminToken() {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    const user = await db.user.findUniqueOrThrow({where:{email:'admin-browser@example.test'}});
    return jwt.sign({sub:user.id}, 'e2e-local-only-secret', {expiresIn:'1h'});
  } finally { await db.$disconnect(); }
}
async function login(page: any) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor();
  await page.getByLabel('Member ID / Email').fill('admin-browser@example.test');
  await page.getByLabel('Password', {exact:true}).fill('E2ePassword!123');
  await page.getByRole('button', {name:/Sign In/}).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', {name:'Unit Leadership Overview'})).toBeVisible();
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
  await page.locator('form[data-hydrated="true"]').waitFor();
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
    const token = await adminToken();
    await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),token);
    const errors:string[]=[];
    page.on('pageerror', e=>{ if (realError(e.message)) errors.push(e.message); });
    page.on('response', r=>{if(r.url().startsWith(`${apiURL}`) && r.status()>=400) errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`));
    expect(errors).toEqual([]);
  });
}
for (const route of ['/member','/member/analytics','/member/availability','/member/check-in','/member/correction-request','/member/leaderboard','/member/meetings','/member/my-attendance','/member/notifications','/member/profile','/member/rewards','/member/submit-excuse']) {
  test(`member route ${route}`, async ({page}) => {
    const token = await memberToken();
    await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),token);
    const errors:string[]=[];
    page.on('pageerror', e=>{ if (realError(e.message)) errors.push(e.message); });
    page.on('response', r=>{if(r.url().startsWith(`${apiURL}`) && r.status()>=400) errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`));
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
  const signed = await request.post(`${apiURL}/auth/login`,{data:{email:'admin-browser@example.test',password:'E2ePassword!123'}});
  const {accessToken} = await signed.json();
  const headers = {Authorization:`Bearer ${accessToken}`};
  const categories = await (await request.get(`${apiURL}/meetings/categories`,{headers})).json();
  const category = categories[0] || await (await request.post(`${apiURL}/meetings/categories`,{headers,data:{name:'Browser category'}})).json();
  const time = (m:number)=>new Date(Date.now()+m*60000).toISOString();
  const created = await request.post(`${apiURL}/meetings`,{headers,data:{title:`Browser excuse ${Date.now()}`,categoryId:category.id,meetingDate:time(0),startTime:time(30),expectedArrivalTime:time(15),attendanceOpenTime:time(0),attendanceCloseTime:time(60),locationName:'Test Venue',latitude:6.5,longitude:3.3}});
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
  const pending = await (await request.get(`${apiURL}/excuses/pending`,{headers})).json();
  expect(pending.some((e:any)=>e.meetingId===meeting.id && e.category==='work')).toBeTruthy();
  await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),accessToken);
  await page.goto('/admin/absence-requests');
  const card = page.getByRole('article').filter({hasText:meeting.title});
  await card.getByLabel('Review note (optional)').fill('Approved for work commitment');
  await card.getByRole('button',{name:'Approve',exact:true}).click();
  await expect(card).toHaveCount(0);
  await page.addInitScript(t=>localStorage.setItem('tfhc_token',t),token);
  await page.goto('/member/submit-excuse');
  const own = page.getByRole('article').filter({hasText:meeting.title});
  await expect(own).toContainText('Status: APPROVED');
  await expect(own).toContainText('Approved for work commitment');
  await page.goto('/member/notifications');
  const notification = page.getByRole('article').filter({hasText:meeting.title});
  await expect(notification).toContainText('Absence request approved');
  await expect(notification).toContainText('Unread');
  await page.getByRole('button',{name:'Mark all as read'}).click();
  await expect(notification).not.toContainText('Unread');
  await page.reload();
  await expect(notification).not.toContainText('Unread');
  await notification.getByRole('link',{name:'View absence request'}).click();
  await expect(page).toHaveURL(/submit-excuse$/);
});

test('member submits weekly availability for a real meeting', async ({page, request}) => {
  const token = await memberToken();
  // The selection is a toggle persisted in the database, so start from a
  // known (deselected) state rather than assuming a fresh run every time.
  await request.put(`${apiURL}/availability/current`,{headers:{Authorization:`Bearer ${token}`},data:{meetingIds:[]}});
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
  const current = await (await request.get(`${apiURL}/availability/current`,{headers:{Authorization:`Bearer ${token}`}})).json();
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
  await page.getByLabel('Google email', {exact:true}).fill(`${name.toLowerCase()}@example.test`);
  await page.getByRole('button',{name:'Save Member'}).click();
  await expect(page.getByRole('heading',{name:'Add New Unit Member'})).not.toBeVisible();
  await page.getByPlaceholder(/Search/).fill(name);
  await expect(page.getByRole('cell').filter({ hasText: `${name} Test` })).toBeVisible();
});

test('meeting details and live monitor render a real meeting', async ({page, request}) => {
  await login(page);
  const token = await page.evaluate(()=>localStorage.getItem('tfhc_token'));
  const headers = {Authorization:`Bearer ${token}`};
  const meetings = await (await request.get(`${apiURL}/meetings`,{headers})).json();
  const meeting = meetings.find((m:any)=>m.status==='SCHEDULED') ?? meetings.find((m:any)=>m.status==='ACTIVE');
  expect(meeting).toBeTruthy();
  await request.put(`${apiURL}/meetings/${meeting.id}/status`,{headers,data:{status:'ACTIVE'}});
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
  await page.route(`${apiURL}/auth/me`,route=>route.abort('connectionrefused'));
  await page.goto('/admin/members');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Unable to connect');
  expect(await page.evaluate(()=>localStorage.getItem('tfhc_token'))).toBe(token);
  await page.unroute(`${apiURL}/auth/me`);
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
    expect(cachedUrls.filter(url=>url.startsWith(`${apiURL}`))).toEqual([]);
    await context.setOffline(true);
    expect(await page.evaluate(async()=>{const response=await caches.match('/logo-icon.svg');return Boolean(response?.ok&&(await response.text()).includes('<svg'));})).toBe(true);
    await context.setOffline(false);
  });
});

test('login does not expose demo credentials', async ({page}) => {
  await page.goto('/login');
  await expect(page.getByLabel('Member ID / Email')).toHaveValue('');
  await expect(page.getByLabel('Password', {exact:true})).toHaveValue('');
});

test('unchecking Remember Me uses a session token and logout clears it', async ({page}) => {
  await page.goto('/login');
  await page.getByLabel('Remember Me').uncheck();
  await page.getByLabel('Member ID / Email').fill('admin-browser@example.test');
  await page.getByLabel('Password', {exact:true}).fill('E2ePassword!123');
  await page.getByRole('button', {name:/Sign In/}).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await page.evaluate(() => localStorage.getItem('tfhc_token'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('tfhc_token'))).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('heading', {name:'Unit Leadership Overview'})).toBeVisible();
  await page.goto('/admin/reports');
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name:'Export Excel (.xlsx)'}).click();
  expect(await (await download).failure()).toBeNull();
  await page.getByTitle('Logout', {exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('tfhc_token'))).toBeNull();
});


test('admin approves and revokes Google access from the member directory', async ({page}) => {
  await login(page);
  await page.goto('/admin/members');
  await page.getByRole('button', {name:/Add New Member/}).click();
  const first = `Access${Date.now()}`;
  await page.getByLabel('First Name', {exact:true}).fill(first);
  await page.getByLabel('Last Name', {exact:true}).fill('Test');
  await page.getByLabel('Phone Number', {exact:true}).fill('08012345678');
  await page.getByLabel('Google email', {exact:true}).fill(`${first.toLowerCase()}@example.test`);
  await page.getByRole('button', {name:'Save Member',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Add New Unit Member'})).not.toBeVisible();
  await page.getByPlaceholder(/Search/).fill(first);
  const access = page.getByRole('button',{name:`Manage Google access for ${first} Test`});
  await expect(access).toHaveText('ACTIVE');
  await access.click();
  await page.getByLabel('Access status').selectOption('REVOKED');
  await page.getByRole('button',{name:'Save Google access',exact:true}).click();
  await expect(access).toHaveText('REVOKED');
});

test('user management: create, edit, photos, deactivate and reactivate', async ({ page, request }) => {
  test.setTimeout(90000);
  const email = `profile-${Date.now()}@example.test`;
  await login(page);
  await page.goto('/admin/members');
  await page.getByRole('button', { name: 'Add New Member', exact: true }).click();
  await page.getByLabel('First Name', { exact: true }).fill('Photo');
  await page.getByLabel('Last Name', { exact: true }).fill('Lifecycle');
  await page.getByLabel('Phone Number', { exact: true }).fill('08012345678');
  await page.getByLabel('Google email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Save Member', exact: true }).click();
  await page.getByPlaceholder('Search by member name, email or code...').fill(email);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const adminToken = await page.evaluate(() => localStorage.getItem('tfhc_token'));
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  let token: string;
  let id: string;
  try {
    const approved = await db.approvedMember.findUniqueOrThrow({ where: { normalizedEmail: email } });
    id = approved.memberId!;
    const account = await db.user.create({ data: { email, role: 'MEMBER', passwordHash: 'unused-google-account', googleSubject: email, member: { connect: { id } } } });
    token = jwt.sign({ sub: account.id }, 'e2e-local-only-secret', { expiresIn: '1h' });
  } finally { await db.$disconnect(); }
  const sharp = require('sharp');
  const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#2563eb' } }).png().toBuffer();
  await page.getByRole('button', { name: 'Edit Photo Lifecycle', exact: true }).click();
  await expect(page.getByLabel('Google email', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByLabel('Profession', { exact: true }).fill('Engineer');
  await page.getByLabel('Birthday (MM-DD)', { exact: true }).fill('03-14');
  await page.getByLabel('Upload profile picture', { exact: true }).setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByAltText('Profile picture', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save Member', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit Member' })).not.toBeVisible();

  await page.evaluate(t => localStorage.setItem('tfhc_token', t), token!);
  await page.goto('/member/profile');
  await expect(page.getByText('Engineer', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Profile picture', { exact: true })).toBeVisible();
  await page.getByLabel('Upload profile picture', { exact: true }).setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.getByText('Profile picture must be 2 MB or smaller.', { exact: true })).toBeVisible();
  await page.getByLabel('Upload profile picture', { exact: true }).setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByText('Profile picture must be 2 MB or smaller.', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeEnabled();
  await page.reload();
  await expect(page.getByAltText('Profile picture', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByLabel('No profile picture')).toBeVisible();
  await page.getByRole('button', { name: /Edit profile/ }).click();
  await page.getByLabel('Profession', { exact: true }).fill('Designer');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Designer', { exact: true })).toBeVisible();

  await page.evaluate(t => localStorage.setItem('tfhc_token', t!), adminToken);
  await page.goto('/admin/members');
  await page.getByPlaceholder('Search by member name, email or code...').fill(email);
  for (const status of ['INACTIVE', 'ACTIVE']) {
    await page.getByRole('button', { name: 'Edit Photo Lifecycle', exact: true }).click();
    await page.getByRole('combobox', { name: 'Member status', exact: true }).selectOption(status);
    await page.getByRole('button', { name: 'Save Member', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit Member' })).not.toBeVisible();
    const response = await request.get(`${apiURL}/members/me/profile`, { headers: { Authorization: `Bearer ${token!}` } });
    expect(response.status()).toBe(status === 'ACTIVE' ? 200 : 401);
    if (status === 'ACTIVE') expect((await response.json()).profession).toBe('Designer');
  }
  for (const status of ['Revoked', 'Approved']) {
    await page.getByRole('button', { name: 'Manage Google access for Photo Lifecycle', exact: true }).click();
    await page.getByLabel('Access status').selectOption({ label: status });
    await page.getByRole('button', { name: 'Save Google access', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const response = await request.get(`${apiURL}/members/me/profile`, { headers: { Authorization: `Bearer ${token!}` } });
    expect(response.status()).toBe(status === 'Approved' ? 200 : 401);
  }
});

test('admin configures a recurring event series', async ({ page, request }) => {
  await login(page);
  const token = await page.evaluate(() => localStorage.getItem('tfhc_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const config = { venue: { name: 'Browser test venue', latitude: 6.6697906, longitude: 3.3581822, radiusMeters: 100 }, arrivalMinutesBefore: 30, reminderMinutes: [60], recipients: 'all', remindersEnabled: false };
  expect((await request.put(`${apiURL}/service-schedules/config`, { headers, data: config })).ok()).toBeTruthy();
  await page.goto('/admin/services');
  const title = `Children browser ${Date.now()}`;
  await page.getByRole('button', { name: '+ New series' }).click();
  await page.getByLabel('Series name').fill(title);
  await page.getByLabel(/Start time/).fill('08:30');
  await page.getByLabel(/End time/).fill('10:00');
  await page.getByRole('button', { name: 'Create series', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  await page.getByLabel(/End time/).fill('10:15');
  await page.getByLabel(/Active \(generate upcoming events\)/).uncheck();
  await page.getByRole('button', { name: 'Save series', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(card).toContainText('Paused');
  await expect(card).toContainText(/08:30[–-]10:15/);
  await page.reload();
  const reloadedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(reloadedCard).toContainText('Paused');
});

test('custom event is visible and member RSVP changes persist for admin', async ({page, request}) => {
  await login(page);
  const adminToken = await page.evaluate(() => localStorage.getItem('tfhc_token'));
  const headers = {Authorization: `Bearer ${adminToken}`};
  const categories = await (await request.get(`${apiURL}/meetings/categories`, {headers})).json();
  const future = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
  const created = await request.post(`${apiURL}/meetings`, {headers, data: {title: `Custom event ${Date.now()}`, description: 'Community outreach', categoryId: categories[0].id, meetingDate: future(120), startTime: future(120), expectedArrivalTime: future(90), attendanceOpenTime: future(90), attendanceCloseTime: future(180), locationName: 'Church', latitude: 6.6697906, longitude: 3.3581822, isCompulsory: false}});
  expect(created.ok()).toBeTruthy();
  const event = await created.json();
  await page.evaluate(t => localStorage.setItem('tfhc_token', t), await memberToken());
  await page.goto('/member/meetings');
  await expect(page.getByText(event.title, {exact:true})).toBeVisible();
  await page.getByText(event.title, {exact:true}).click();
  await expect(page.getByText('Community outreach', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Attending', exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Your response: Attending');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Your response: Attending');
  await page.getByRole('button', {name:'Not attending', exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Your response: Not attending');
  await page.evaluate(t => localStorage.setItem('tfhc_token', t!), adminToken);
  await page.goto(`/admin/live-meeting/${event.id}`);
  await expect(page.getByText('0 attending · 1 not attending', {exact:true})).toBeVisible();
});

 test('admin analytics loads real totals and changes reporting period', async ({page}) => {
  await login(page);
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading',{name:'Attendance analytics',exact:true})).toBeVisible();
  await expect(page.getByText('Completed services',{exact:true})).toBeVisible();
  await page.getByLabel('Reporting period').selectOption('7');
  await expect(page.getByRole('heading',{name:'Attendance over time',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Absence requests',exact:true})).toBeVisible();
  await page.getByLabel('Reporting period').selectOption('90');
  await expect(page.getByRole('heading',{name:'Event RSVPs',exact:true})).toBeVisible();
 });

test('venue session signs out after an overdue check confirms departure', async ({page}) => {
  const token = await memberToken();
  await page.addInitScript(t => {
    if (!location.pathname.startsWith('/member')) return;
    localStorage.setItem('tfhc_token',t);
    localStorage.setItem('tfhc_venue_session',JSON.stringify({latitude:6.6697906,longitude:3.3581822,radius:100,checkedAt:Date.now()-601000}));
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(success:any)=>success({coords:{latitude:6.7,longitude:3.4,accuracy:5}})}});
  },token);
  await page.goto('/member',{waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/login\?reason=left-venue$/);
  expect(await page.evaluate(()=>localStorage.getItem('tfhc_token'))).toBeNull();
});

test('sign-in displays the branded loading screen', async ({page}) => {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor();
  let release!: () => void;
  const pending = new Promise<void>(resolve=>{release=resolve;});
  await page.route(`${apiURL}/auth/login`,async route=>{await pending;await route.continue();});
  await page.getByLabel('Member ID / Email').fill('admin-browser@example.test');
  await page.getByLabel('Password',{exact:true}).fill('E2ePassword!123');
  await page.getByRole('button',{name:/Sign In/}).click();
  await expect(page.getByRole('status',{name:'Signing in'})).toBeVisible();
  release();
  await expect(page).toHaveURL(/admin$/);
});

test('admin saves scoring settings and downloads CSV', async ({page,request}) => {
  await login(page);
  const token = await page.evaluate(()=>localStorage.getItem('tfhc_token'));
  const headers = {Authorization:`Bearer ${token}`};
  const previous = await (await request.get(`${apiURL}/reports/settings`,{headers})).json();
  try {
    await page.goto('/admin/settings');
    await page.getByLabel('Attendance weight (0–1)',{exact:true}).fill('0.7');
    await page.getByLabel('Punctuality weight (0–1)',{exact:true}).fill('0.3');
    await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Settings saved');
    await expect(page.getByRole('heading',{name:'Members eligible for recognition'})).toBeVisible();
    await page.goto('/admin/reports');
    await page.getByLabel('Export format').selectOption('csv');
    const download = page.waitForEvent('download');
    await page.getByRole('button',{name:'Export CSV (.csv)',exact:true}).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  } finally { await request.put(`${apiURL}/reports/settings`,{headers,data:previous}); }
});

test('poor location accuracy does not sign a member out', async ({page}) => {
  const token = await memberToken();
  await page.addInitScript(t => {
    if (!location.pathname.startsWith('/member')) return;
    localStorage.setItem('tfhc_token',t);
    localStorage.setItem('tfhc_venue_session',JSON.stringify({latitude:6.6697906,longitude:3.3581822,radius:100,checkedAt:Date.now()-601000}));
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(success:any)=>success({coords:{latitude:6.7,longitude:3.4,accuracy:500}})}});
  },token);
  await page.goto('/member',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('link',{name:/View all/i})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('tfhc_token'))).toBe(token);
  await expect(page).toHaveURL(/member$/);
});

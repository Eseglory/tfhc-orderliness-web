const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync('apps/web/src/components/SundayAutoCheckIn.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness({ denied = false, hidden = false, enabled = true, day = '2026-10-11T07:15:00Z' } = {}) {
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = hidden ? 'hidden' : 'visible';
  let tick, cleanup, message = '', token = 'member-a', gpsCallback;
  let holdGps = false;
  const calls = [];
  let recorded = false;
  window.setInterval = fn => { tick = fn; return 1; };
  window.clearInterval = () => {};
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [day])); } static now() { return new Date(day).getTime(); } }
  const navigator = { onLine: true, userAgent: 'test', geolocation: {
    getCurrentPosition(resolve, reject, options) {
      assert.equal(options.maximumAge, 0);
      const success = () => resolve({ coords: { latitude: 6.67, longitude: 3.35, accuracy: 10 }, timestamp: Clock.now() });
      gpsCallback = success;
      if (holdGps) return;
      if (denied) reject(new Error('denied')); else success();
    },
  } };
  const api = { getAuthToken: () => token, fetchApi: async (url, options) => {
    calls.push({ url, options });
    if (!options) return { enabled, meetings: enabled && !recorded ? [{ id: 'second', title: 'Second Service' }] : [] };
    recorded = true; return {};
  } };
  const exports = {};
  vm.runInNewContext(code, { exports, window, document, navigator, Event, Date: Clock,
    require: name => name === 'react' ? { useEffect: fn => { cleanup = fn(); }, useState: () => ['', value => { message = value; }] }
      : name === 'next/navigation' ? { usePathname: () => '/member' }
      : name === 'react/jsx-runtime' ? { jsx: () => null } : api,
  });
  return { start: () => exports.SundayAutoCheckIn(), calls, window, document,
    tick: () => tick(), cleanup: () => cleanup(), message: () => message,
    deny: value => { denied = value; }, hold: () => { holdGps = true; },
    logout: () => { token = null; }, finishGps: () => gpsCallback() };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('checks in with a fresh position and refreshes attendance without duplicating on next poll', async () => {
  const h = harness(); let refreshed = 0;
  h.window.addEventListener('attendance-updated', () => refreshed++);
  h.start(); await flush();
  assert.match(h.message(), /Automatically checked in for Second Service/);
  assert.equal(refreshed, 1);
  const body = JSON.parse(h.calls.find(c => c.options).options.body);
  assert.equal(body.meetingId, 'second'); assert.equal(body.gpsAccuracy, 10);
  h.tick(); await flush(); assert.equal(h.calls.filter(c => c.options).length, 1);
  h.cleanup();
});
test('does not run in hidden pages and resumes on visibility', async () => {
  const h = harness({ hidden: true }); h.start(); await flush(); assert.equal(h.calls.length, 0);
  h.document.visibilityState = 'visible'; h.document.dispatchEvent(new Event('visibilitychange'));
  await flush(); assert.equal(h.calls.filter(c => c.options).length, 1); h.cleanup();
});
test('location denial never records attendance and recovers on retry', async () => {
  const h = harness({ denied: true }); h.start(); await flush();
  assert.equal(h.calls.filter(c => c.options).length, 0); assert.match(h.message(), /could not be verified/);
  h.deny(false); h.tick(); await flush(); assert.equal(h.calls.filter(c => c.options).length, 1); h.cleanup();
});
test('logout during GPS acquisition prevents submission', async () => {
  const h = harness(); h.hold(); h.start(); await flush(); h.logout(); h.finishGps(); await flush();
  assert.equal(h.calls.filter(c => c.options).length, 0); h.cleanup();
});
test('unmount during GPS acquisition prevents submission', async () => {
  const h = harness(); h.hold(); h.start(); await flush(); h.cleanup(); h.finishGps(); await flush();
  assert.equal(h.calls.filter(c => c.options).length, 0);
});
test('does not run on Monday in Nigeria even when it is still Sunday UTC', async () => {
  const h = harness({ day: '2026-10-11T23:01:00Z' }); h.start(); await flush(); assert.equal(h.calls.length, 0); h.cleanup();
});

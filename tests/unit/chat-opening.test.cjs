const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the component's real async callback with controlled network promises.
const source = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/components/chat/ChatWorkspace.tsx'), 'utf8');
const ast = ts.createSourceFile('ChatWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'openRoom') {
    callback = node.initializer.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(callback);
const code = ts.transpile(`(${callback})`, { target: ts.ScriptTarget.ES2022 });

function harness(overrides = {}) {
  const state = {};
  const context = {
    performance, activeIdRef: { current: null }, syncCursors: { current: new Map() },
    chatAccount: () => 'account', dispatch() {}, socket: { subscribe() {} },
    getLocalCachedMessages: () => [], getLocalSyncCursor: () => 'previous',
    chatApi: { messages: async () => ({ messages: [{ id: 'message' }], nextCursor: null, syncCursor: 'next' }) },
    mergeChatMessages: (_, messages) => messages, saveLocalCachedMessages() {},
    setReduxActiveRoomId() {}, setReduxMessages() {}, markRoomRead() {},
    scrollToBottom() {}, chatTiming() {}, synchronizeRoom: async () => {},
    ...overrides,
  };
  for (const name of ['ActiveId', 'RoomLoadError', 'MobileThread', 'ReplyTo', 'Editing', 'NextCursor',
    'TypingBy', 'InChatSearch', 'ShowInChatSearch', 'ShowRoomInfo', 'Messages', 'LoadingRoom']) {
    context[`set${name}`] = value => { state[name] = value; };
  }
  return { state, open: vm.runInNewContext(code, context) };
}

test('first page is visible while history synchronization is still pending', async () => {
  let release;
  let started;
  const syncing = new Promise(resolve => { started = resolve; });
  const h = harness({ synchronizeRoom: () => { started(); return new Promise(resolve => { release = resolve; }); } });
  const opening = h.open('general');
  await Promise.race([syncing, opening]);
  assert.equal(h.state.RoomLoadError, '');
  assert.equal(h.state.Messages[0].id, 'message');
  assert.equal(h.state.LoadingRoom, false);
  release();
  await opening;
});

test('failed initial request clears spinner and exposes retry error', async () => {
  const h = harness({ chatApi: { messages: async () => { throw new Error('Unavailable'); } } });
  await h.open('general');
  assert.equal(h.state.LoadingRoom, false);
  assert.ok(h.state.RoomLoadError);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.cwd() + '/node_modules/typescript');
function loadStore() {
 const storage = new Map(); let account = 'alice';
 const token = () => 'x.' + Buffer.from(JSON.stringify({ sub: account })).toString('base64') + '.x';
 const localStorage = { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key), get length(){return storage.size;}, key:i=>[...storage.keys()][i] };
 const context = { exports: {}, require: () => ({getAuthToken: token}), window: {}, localStorage, atob: v=>Buffer.from(v,'base64').toString() };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/lib/chat-store.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,context);
 return { store:context.exports, account: value=>account=value };
}
test('device cache never crosses account boundaries',()=>{
 const {store,account}=loadStore();store.saveLocalCachedRooms([{id:'private'}]);store.saveLocalCachedMessages('private',[{id:'a'}]);
 account('bob');assert.equal(store.getLocalCachedRooms().length,0);assert.equal(store.getLocalCachedMessages('private').length,0);
 account('alice');assert.equal(store.getLocalCachedRooms()[0].id,'private');assert.equal(store.getLocalCachedMessages('private')[0].id,'a');
});
test('ack, socket duplicate and replay converge to one message',()=>{
 const {store}=loadStore();const pending={id:'client',clientId:'client',pending:true,createdAt:'2026-01-01'};
 const saved={id:'server',clientId:'client',createdAt:'2026-01-02'};
 let state=store.mergeChatMessages([pending],[saved]);state=store.mergeChatMessages(state,[saved]);state=store.mergeChatMessages(state,[pending]);
 assert.equal(state.length,1);assert.equal(state[0].id,'server');
});
test('out-of-order replay keeps timeline chronological',()=>{
 const {store}=loadStore();const messages=store.mergeChatMessages([{id:'b',createdAt:'2026-01-02'}],[{id:'a',createdAt:'2026-01-01'}]);
 assert.equal(messages.map(m=>m.id).join(','),'a,b');
});

test('stale network snapshots cannot undo an edit or tombstone',()=>{
 const {store}=loadStore();
 const newer={id:'a',body:null,createdAt:'2026-01-01',deletedAt:'2026-01-03'};
 const stale={id:'a',body:'old',createdAt:'2026-01-01',editedAt:'2026-01-02'};
 assert.equal(store.mergeChatMessages([newer],[stale])[0].body,null);
});
test('messages and sync cursor share the same cache snapshot',()=>{
 const {store}=loadStore();store.saveLocalCachedMessages('r',[{id:'a'}],'42');
 assert.equal(store.getLocalSyncCursor('r'),'42');
 store.saveLocalCachedMessages('r',[{id:'a'},{id:'b'}]);
 assert.equal(store.getLocalSyncCursor('r'),'42');
});

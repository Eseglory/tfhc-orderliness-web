const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function harness(){
 let token='alice'; const calls=[];
 const api={getAuthToken:()=>token,fetchApi:()=>new Promise((resolve,reject)=>calls.push({resolve,reject}))};
 const context={exports:{},require:()=>api};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/lib/chat-requests.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {read:context.exports.sharedChatRead,calls,account:value=>token=value};
}
test('concurrent chat badge requests share one request, then refresh normally',async()=>{
 const h=harness();const a=h.read('/chat/unread');const b=h.read('/chat/unread');
 assert.equal(h.calls.length,1);assert.equal(a,b);h.calls[0].resolve({total:2});await a;
 const c=h.read('/chat/unread');assert.equal(h.calls.length,2);h.calls[1].resolve({total:0});await c;
});
test('account changes never share an old request and old completion preserves the new request',async()=>{
 const h=harness();const a=h.read('/chat/rooms');h.account('bob');const b=h.read('/chat/rooms');
 assert.equal(h.calls.length,2);h.calls[0].resolve([]);await a;
 assert.equal(h.read('/chat/rooms'),b);h.calls[1].resolve([]);await b;
});
test('failed reads can be retried',async()=>{
 const h=harness();const a=h.read('/chat/rooms');h.calls[0].reject(new Error('offline'));
 await assert.rejects(a,/offline/);const b=h.read('/chat/rooms');assert.equal(h.calls.length,2);h.calls[1].resolve([]);await b;
});
test('profile API paths use the API origin while external and local assets are preserved',()=>{
 const context={exports:{},URL,require:()=>({getApiBaseUrl:()=> 'https://api.example.test/'})};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/lib/profile-image.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 const resolve=context.exports.resolveProfileImage;
 assert.equal(resolve('/members/123/photo'),'https://api.example.test/members/123/photo?v=2');
 assert.equal(resolve('members/123/photo'),'https://api.example.test/members/123/photo?v=2');
 assert.equal(resolve('/members/123/photo?v=abc'),'https://api.example.test/members/123/photo?v=abc');
 for(const value of ['https://images.example.test/a.jpg','data:image/webp;base64,YQ==','blob:preview','/logo-icon.svg']) assert.equal(resolve(value),value);
 assert.equal(resolve(null),undefined);
});

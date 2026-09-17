// Run: node --experimental-vm-modules --test tests/corner.test.mjs
// Provider responses are fixtures; this does not claim a live Gemini test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';
import {DatabaseSync} from 'node:sqlite';
const root=process.cwd();
async function harness(key=true){
 const sql=new DatabaseSync(':memory:');for(const file of ['drizzle/0000_sleepy_unicorn.sql','drizzle/0001_ancient_runaways.sql'])sql.exec(readFileSync(file,'utf8'));
 sql.exec('CREATE TABLE generation_call (id TEXT PRIMARY KEY, model TEXT, created_at INTEGER, status TEXT, response TEXT)');
 const db={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>stmt.run(...args)}}}}};
 const responses=[];let calls=0;const context=vm.createContext({process:{env:key?{GEMINI_API_KEY:'test-only-not-a-real-key',DATABASE_URL:'test-only'}:{}},Response,Request,ReadableStream,TextEncoder,TextDecoder,AbortSignal,URL,crypto,setInterval,clearInterval,console,fetch:async()=>{calls++;const next=responses.shift();assert.ok(next,'unexpected provider request');return Response.json(next)}});
 const env={DB:db,...(key?{GEMINI_API_KEY:'test-only-not-a-real-key'}:{})};
 const cache=new Map();function synthetic(name,data){const m=new vm.SyntheticModule(Object.keys(data),function(){for(const [k,v]of Object.entries(data))this.setExport(k,v)},{context,identifier:name});cache.set(name,m);return m}
 synthetic('@/db/crate',{crateDb:()=>db});synthetic('@/lib/session',{sessionIdentity:r=>r.headers.get('test-session'),ensureSession:(r,response)=>response});synthetic('zod',zod);synthetic('@/lib/stories',{topicIds:['river']});
 async function load(name,parent=root+'/x.ts'){
 if(cache.has(name))return cache.get(name);
 const file=name.startsWith('@/')?resolve(root,name.slice(2)+'.ts'):name.startsWith('.')?resolve(parent,'..',name+'.ts'):name;
 if(cache.has(file))return cache.get(file);
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const m=new vm.SourceTextModule(code,{context,identifier:file});cache.set(file,m);await m.link((s,mod)=>load(s,mod.identifier));return m;
 }
 const route=await load(root+'/app/api/corner/route.ts');await route.evaluate();const crate=await load(root+'/app/api/crate/route.ts');await crate.evaluate();
 const request=(data,user='alice',origin='https://threeangle.test')=>new Request('https://threeangle.test/api/corner',{method:'POST',headers:{'Content-Type':'application/json',...(user?{'test-session':user}:{}),origin},body:JSON.stringify(data)});
 return {api:route.namespace,crate:crate.namespace,sql,responses,request,get calls(){return calls}};
}
const response=(text,search=false)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:typeof text==='string'?text:JSON.stringify(text)}]},...(search?{groundingMetadata:{groundingChunks:[{web:{uri:'https://example.com/book',title:'Publisher'}},{web:{uri:'https://example.com/film',title:'Film'}},{web:{uri:'https://example.com/episode',title:'Podcast'}}]}}:{})}]});
const seed={title:'The Emerald Mile',creator:'Kevin Fedarko',format:'Book',year:'2013',description:'A history of a river run.',source:0,facts:[{text:'A sourced detail.',source:0}]};
const output={name:'River power',kicker:'RIVER / POWER',hook:'Follow the river.',intro:'Three different perspectives.',heads:['Read','Watch','Listen'],bridges:['One','Two','Three'],shift:'The river changes.',payoff:'A linked perspective.',question:'Who decides?',angles:['One','Two','Three'],answers:['One','Two','Three'],bonus:'A fourth view',works:[{title:seed.title,creator:seed.creator,format:'Book',pitch:'Read this.',source:0},{title:'DamNation',creator:'Travis Rummel / Ben Knight',format:'Documentary',pitch:'Watch this.',source:1},{title:'7 States, 1 River and an Agonizing Choice',creator:'The Daily',format:'Podcast episode',pitch:'Listen to this.',source:2},{title:'Down the Great Unknown',creator:'Edward Dolnick',format:'Book',pitch:'A bonus.',source:0}]};
test('anonymous, cross-origin and missing-key requests cannot call Gemini',async()=>{
 const h=await harness(false);assert.equal((await h.api.POST(h.request({action:'lookup',title:'Book'},null))).status,401);assert.equal((await h.api.POST(h.request({action:'lookup',title:'Book'},'alice','https://elsewhere.test'))).status,403);assert.equal((await h.api.POST(h.request({action:'lookup',title:'Book'}))).status,503);assert.equal(h.calls,0);
});
test('confirmed seed survives generation; ownership, crate persistence and repeat recovery hold',async()=>{
 const h=await harness();h.responses.push(response('Research on the input work.',true),response({matches:[seed]}));const lookup=await (await h.api.POST(h.request({action:'lookup',title:seed.title}))).json();assert.equal(lookup.matches[0].title,seed.title);
 assert.equal((await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''},'bob'))).status,404);
 h.responses.push(response('Research on all recommended works.',true),response(output));const r=await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:'Water rights'}));const events=(await r.text()).trim().split('\n').map(JSON.parse);const topic=events.find(e=>e.type==='result')?.topic;assert.ok(topic);assert.equal(topic.works[0].title,seed.title);assert.equal(topic.works[2].format,'Podcast episode');assert.equal(topic.works.length,4);
 const again=await (await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''}))).json();assert.equal(again.topic.id,topic.id);assert.equal(h.calls,4);
 assert.equal((await h.crate.PUT(h.request({topicId:topic.id},'bob'))).status,404);assert.equal((await h.crate.PUT(h.request({topicId:topic.id}))).status,200);
 const saved=await (await h.crate.GET(new Request('https://threeangle.test/api/crate',{headers:{'test-session':'alice'}}))).json();assert.equal(saved.items[0].topic.works[0].title,seed.title);
 const other=await (await h.crate.GET(new Request('https://threeangle.test/api/crate',{headers:{'test-session':'bob'}}))).json();assert.equal(other.items.length,0);
});
test('out-of-range research references fail without a confirmed draft',async()=>{
 const h=await harness();h.responses.push(response('Research.',true),response({matches:[{...seed,source:99}]}));const r=await h.api.POST(h.request({action:'lookup',title:'The Emerald Mile'}));assert.equal(r.status,503);assert.equal(h.sql.prepare('SELECT count(*) n FROM corner_draft').get().n,0);
});
test('daily quota is atomic and stops before another provider request',async()=>{
 const h=await harness();const day=new Date().toISOString().slice(0,10);h.sql.prepare('INSERT INTO corner_usage(scope,count) VALUES (?,?)').run(`lookup:alice:${day}`,10);assert.equal((await h.api.POST(h.request({action:'lookup',title:'Another book'}))).status,429);assert.equal(h.calls,0);
});

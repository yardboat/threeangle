// Run: node --experimental-vm-modules --test tests/corner.test.mjs
// The model (AI SDK) and the catalogs are fixtures; this checks the pipeline around them, not live services.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';
import {DatabaseSync} from 'node:sqlite';
const root=process.cwd();
const seed={title:'The Emerald Mile',creator:'Kevin Fedarko',format:'Book',year:'2013',description:'A history of a river run.',url:'https://openlibrary.org/works/OL1W',image:'https://covers.openlibrary.org/b/id/1-L.jpg',from:'openlibrary'};
const proposal={status:'ok',topic:'Who decides what a river is for.',insight:'Three views of one river.',corners:[{slot:'watch',title:'DamNation',creator:'Travis Rummel and Ben Knight',format:'Documentary'},{slot:'listen',title:'7 States, 1 River and an Agonizing Choice',creator:'The Daily',format:'Podcast episode'}],bonus:{title:'Down the Great Unknown',creator:'Edward Dolnick',format:'Book'}};
const writer={name:'River power',kicker:'RIVER / POWER',hook:'Follow the river.',intro:'Three different perspectives.',heads:['Read the river run','Watch the dams fall','Listen to the deal'],bridges:['From the book to the film.','From the film to the episode.','From the episode to the book.'],shift:'The river changes.',payoff:'A linked perspective.',question:'Who decides?',angles:['One','Two','Three'],answers:['The first answer here.','The second answer here.','The third answer here.'],bonus:'A fourth view',works:[{title:seed.title,creator:seed.creator,format:'Book',pitch:'Read this.'},{title:'DamNation',creator:'Travis Rummel and Ben Knight',format:'Documentary',pitch:'Watch this.'},{title:'7 States, 1 River and an Agonizing Choice',creator:'The Daily',format:'Podcast episode',pitch:'Listen to this.'},{title:'Down the Great Unknown',creator:'Edward Dolnick',format:'Book',pitch:'A bonus.'}]};

async function harness({key=true,unfindable=[],env={}}={}){
 const sql=new DatabaseSync(':memory:');for(const file of ['drizzle/0000_sleepy_unicorn.sql','drizzle/0001_ancient_runaways.sql','drizzle/0002_quote_cache.sql'])sql.exec(readFileSync(file,'utf8'));
 sql.exec('CREATE TABLE generation_call (id TEXT PRIMARY KEY, model TEXT, created_at INTEGER, status TEXT, response TEXT)');
 const db={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>stmt.run(...args)}}}}};
 // The model: each generateText call takes the next scripted output.
 const outputs=[],calls=[];
 const ai={generateText:async args=>{calls.push(args);const next=outputs.shift();assert.ok(next,'unexpected model call');if(next instanceof Error)throw next;return {output:structuredClone(next),steps:[],usage:{inputTokenDetails:{cacheReadTokens:0}}}},isStepCount:n=>n,Output:{object:x=>x},gateway:{tools:{exaSearch:()=>({})}}};
 const anthropic={anthropic:{tools:{webSearch_20250305:()=>({})}},createAnthropic:()=>model=>model};
 // The catalogs: every work is found, except titles listed as unfindable.
 const formatOf=f=>{const x=f.toLowerCase();return x.includes('album')?'Album':x.includes('podcast')?'Podcast episode':x.includes('documentary')?'Documentary':x.includes('article')?'Article':x.includes('book')?'Book':x.includes('movie')||x.includes('film')?'Movie':x.includes('show')?'Show':null};
 const resolved=[];
 const catalog={formatOf,titleFit:(a,b)=>a.toLowerCase()===b.toLowerCase()?1:0,
  resolveWork:async q=>{resolved.push(q.title);return unfindable.includes(q.title)?null:{title:q.title,creator:q.creator,format:formatOf(q.format),year:'',description:'',url:'https://catalog.test/'+encodeURIComponent(q.title),image:'https://image.tmdb.org/t/p/w500/'+encodeURIComponent(q.title)+'.jpg',from:'test'}},
  describe:async c=>c.description+' Fuller dossier.',
  findEpisodes:async terms=>[{title:'The River Is Running Dry',creator:'The Daily',format:'Podcast episode',year:'2023',description:'On the Colorado.',url:'https://podcasts.apple.com/x',from:'itunes'}],
  readCandidate:token=>token==='signed-emerald-mile-token'?structuredClone(seed):null};
 const context=vm.createContext({process:{env:{...(key?{ANTHROPIC_API_KEY:'test-only-not-a-real-key',DATABASE_URL:'test-only'}:{}),...env}},Response,Request,ReadableStream,TextEncoder,TextDecoder,AbortSignal,AbortController,URL,URLSearchParams,crypto,setInterval,clearInterval,setTimeout,clearTimeout,console,structuredClone,fetch:async()=>{throw new Error('no network in tests')}});
 const cache=new Map();function synthetic(name,data){const m=new vm.SyntheticModule(Object.keys(data),function(){for(const [k,v]of Object.entries(data))this.setExport(k,v)},{context,identifier:name});cache.set(name,m);return m}
 synthetic('@/db/crate',{crateDb:()=>db});synthetic('@/lib/session',{sessionIdentity:r=>r.headers.get('test-session'),ensureSession:(r,response)=>response});synthetic('zod',zod);synthetic('@/lib/stories',{topicIds:['river']});
 synthetic('ai',ai);synthetic('@ai-sdk/anthropic',anthropic);
 const cat=synthetic(root+'/lib/catalog.ts',catalog);cache.set('@/lib/catalog',cat);
 const page=synthetic(root+'/lib/page.ts',{openPage:async url=>({ok:false,status:0,url,title:'',description:'',text:''})});cache.set('@/lib/page',page);
 async function load(name,parent=root+'/x.ts'){
  if(cache.has(name))return cache.get(name);
  if(name.endsWith('.json')){const file=resolve(parent,'..',name);return synthetic(file,{default:JSON.parse(readFileSync(file,'utf8'))});}
  const file=name.startsWith('@/')?resolve(root,name.slice(2)+'.ts'):name.startsWith('.')?resolve(parent,'..',name+'.ts'):name;
  if(cache.has(file))return cache.get(file);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const m=new vm.SourceTextModule(code,{context,identifier:file});cache.set(file,m);await m.link((s,mod)=>load(s,mod.identifier));return m;
 }
 const mod=async path=>{const m=await load(root+path);await m.evaluate();return m.namespace};
 const api=await mod('/app/api/corner/route.ts'),crate=await mod('/app/api/crate/route.ts'),quotes=await mod('/app/api/quotes/route.ts');
 const request=(data,user='alice',origin='https://threeangle.test',path='/api/corner')=>new Request('https://threeangle.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(user?{'test-session':user}:{}),origin},body:JSON.stringify(data)});
 const get=(query,user)=>new Request('https://threeangle.test/api/corner'+query,{headers:user?{'test-session':user}:{}});
 const events=async r=>(await r.text()).trim().split('\n').map(l=>JSON.parse(l));
 const pick=async(user='alice')=>(await api.POST(request({action:'pick',token:'signed-emerald-mile-token'},user))).json();
 return {api,crate,quotes,sql,outputs,calls,resolved,request,get,events,pick};
}

test('anonymous, cross-origin and unconfigured requests never reach the model',async()=>{
 const h=await harness({key:false});
 assert.equal((await h.api.POST(h.request({action:'lookup',title:'Book'},null))).status,401);
 assert.equal((await h.api.POST(h.request({action:'lookup',title:'Book'},'alice','https://elsewhere.test'))).status,403);
 assert.equal((await h.api.POST(h.request({action:'lookup',title:'Book'}))).status,503);
 assert.equal(h.calls.length,0);
});
test('only a signed catalog result can be confirmed, and it is kept with its cover and a fuller dossier',async()=>{
 const h=await harness();
 assert.equal((await h.api.POST(h.request({action:'pick',token:'forged-token-with-any-title-at-all'}))).status,400);
 const lookup=await h.pick();
 assert.equal(lookup.matches[0].title,seed.title);assert.equal(lookup.matches[0].image,seed.image);
 assert.match(lookup.matches[0].description,/Fuller dossier/);assert.equal(lookup.sources[0].url,seed.url);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM corner_draft').get().n,1);assert.equal(h.calls.length,0);
});
test('a build streams real progress and ships catalog links and covers; the result is shareable read-only',async()=>{
 const h=await harness();const lookup=await h.pick();
 assert.equal((await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''},'bob'))).status,404);
 h.outputs.push(proposal,writer);
 const ev=await h.events(await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:'Water rights'})));
 const status=ev.filter(e=>e.type==='status').map(e=>e.text);
 assert.ok(status.includes('Found the watch: DamNation.'),status.join(' | '));assert.ok(status.some(s=>s.startsWith('The angle: ')));
 const topic=ev.find(e=>e.type==='result')?.topic;assert.ok(topic);
 assert.equal(topic.works.length,4);assert.equal(topic.works[0].title,seed.title);assert.equal(topic.works[0].image,seed.image);
 assert.equal(topic.works[1].url,'https://catalog.test/DamNation');assert.match(topic.works[1].image,/^https:\/\/image\.tmdb\.org\//);
 assert.ok(topic.works.every(w=>!/google\.com\/search|justwatch|openlibrary\.org\/search/.test(w.url)));
 // Both model calls share one cached prefix: the editor's brief and the reference triangles.
 for(const c of h.calls)assert.equal(JSON.stringify(c.system[1].providerOptions),JSON.stringify({anthropic:{cacheControl:{type:'ephemeral'}}}));
 assert.equal(h.calls.length,2);
 const again=await (await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''}))).json();assert.equal(again.topic.id,topic.id);assert.equal(h.calls.length,2);
 // Anyone with the link can read it; only the maker owns it.
 const shared=await (await h.api.GET(h.get('?id='+lookup.id,'bob'))).json();assert.equal(shared.topic.id,topic.id);assert.equal(shared.owner,false);
 assert.equal((await (await h.api.GET(h.get('?id='+lookup.id,'alice'))).json()).owner,true);
 assert.equal((await h.api.GET(h.get('?id='+lookup.id))).status,200);
 // Keeping it is per browser: Bob can keep Alice's shared triangle in his own collection.
 assert.equal((await h.crate.PUT(h.request({topicId:topic.id},'bob'))).status,200);
 const bobs=await (await h.crate.GET(new Request('https://threeangle.test/api/crate',{headers:{'test-session':'bob'}}))).json();assert.equal(bobs.items[0].topic.works[0].title,seed.title);
 const carol=await (await h.crate.GET(new Request('https://threeangle.test/api/crate',{headers:{'test-session':'carol'}}))).json();assert.equal(carol.items.length,0);
 // "Find another angle" from a shared link starts the visitor's own draft from the same work.
 const reused=await (await h.api.POST(h.request({action:'reuse',topicId:topic.id},'bob'))).json();assert.notEqual(reused.id,lookup.id);assert.equal(reused.matches[reused.choice].title,seed.title);
});
test('an unfinished draft is private to its maker',async()=>{
 const h=await harness();const lookup=await h.pick();
 assert.equal((await h.api.GET(h.get('?id='+lookup.id,'bob'))).status,404);
 assert.equal((await h.api.GET(h.get('?id='+lookup.id,'alice'))).status,200);
});
test('a work no catalog can find is re-picked once, never shipped',async()=>{
 const h=await harness({unfindable:['DamNation']});const lookup=await h.pick();
 const repick=structuredClone(proposal);repick.corners[0]={slot:'watch',title:'The Emerald Mile Rapids',creator:'A Filmmaker',format:'Documentary'};
 h.outputs.push(proposal,repick,writer);
 const ev=await h.events(await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''})));
 assert.ok(ev.some(e=>e.type==='status'&&/Couldn’t find DamNation/.test(e.text)));
 const topic=ev.find(e=>e.type==='result')?.topic;assert.ok(topic);
 assert.equal(topic.works[1].title,'The Emerald Mile Rapids');assert.ok(!topic.works.some(w=>w.title==='DamNation'));
 assert.match(h.calls[1].prompt,/DO NOT USE: \["DamNation"\]/);
});
test('an episode no catalog can find is swapped for a real catalog episode, without a second pick',async()=>{
 const h=await harness({unfindable:['7 States, 1 River and an Agonizing Choice']});const lookup=await h.pick();
 // pick, the one small call that chooses from real episodes, writer
 h.outputs.push({...proposal,listenSearch:['colorado river','water rights']},{title:'The River Is Running Dry',show:'The Daily'},writer);
 const ev=await h.events(await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''})));const topic=ev.find(e=>e.type==='result')?.topic;
 assert.ok(topic,JSON.stringify(ev.filter(e=>e.type!=='heartbeat')));
 assert.equal(topic.works[2].title,'The River Is Running Dry');assert.equal(topic.works[2].url,'https://podcasts.apple.com/x');
 assert.equal(h.calls.length,3);assert.match(h.calls[1].prompt,/The River Is Running Dry/);
 assert.match(h.calls[2].prompt,/The River Is Running Dry/);assert.doesNotMatch(h.calls[2].prompt,/7 States/);
});
test('a work still unfindable after the last attempt ships with a search link instead of failing',async()=>{
 const h=await harness({unfindable:['DamNation']});const lookup=await h.pick();
 h.outputs.push(proposal,proposal,proposal,proposal,writer);
 const ev=await h.events(await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''})));
 const topic=ev.find(e=>e.type==='result')?.topic;assert.ok(topic,JSON.stringify(ev.filter(e=>e.type!=='heartbeat')));
 assert.equal(topic.works[1].title,'DamNation');assert.match(topic.works[1].url,/^https:\/\/www\.google\.com\/search\?q=DamNation/);
 assert.equal(topic.works[2].url,'https://catalog.test/'+encodeURIComponent('7 States, 1 River and an Agonizing Choice'));
 assert.equal(h.calls.length,5);
});
test('the writer cannot relabel a work: identities come from the confirmed work and the catalogs',async()=>{
 const h=await harness();const lookup=await h.pick();
 const changed=structuredClone(writer);changed.works[0].creator='A different author';changed.works[1].title='Something else';
 h.outputs.push(proposal,changed);
 const topic=(await h.events(await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''})))).find(e=>e.type==='result')?.topic;
 assert.equal(topic.works[0].creator,seed.creator);assert.equal(topic.works[1].title,'DamNation');
});
test('needs-more-research is answered with another attempt, not shown to the visitor',async()=>{
 const h=await harness();const lookup=await h.pick();
 h.outputs.push({status:'needs_more_research',reason:'I could not verify an episode.'},proposal,writer);
 const topic=(await h.events(await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''})))).find(e=>e.type==='result')?.topic;
 assert.ok(topic);assert.match(h.calls[1].prompt,/YOU MUST CHOOSE/);
});
test('a limitation reaches the visitor only after every attempt and one rerun, and nothing is saved',async()=>{
 const h=await harness();const lookup=await h.pick();
 const no={status:'needs_more_research',reason:'I could not verify an episode that adds a distinct perspective.'};
 h.outputs.push(no,no,no,no,no,no,no,no);
 const ev=await h.events(await h.api.POST(h.request({action:'generate',id:lookup.id,choice:0,interest:''})));
 assert.ok(ev.some(e=>e.type==='error'&&e.error.includes('verify an episode')));assert.ok(!ev.some(e=>e.type==='result'));
 assert.ok(ev.some(e=>e.type==='status'&&/another path/.test(e.text)));
 assert.equal(h.sql.prepare('SELECT result FROM corner_draft WHERE id=?').get(lookup.id).result,null);assert.equal(h.calls.length,8);
});
test('quotes for a work are searched once and then served from the cache',async()=>{
 const h=await harness();const lookup=await h.pick();
 h.outputs.push({quotes:[]});
 const ask=()=>h.quotes.POST(h.request({id:lookup.id,choice:0},'alice','https://threeangle.test','/api/quotes'));
 assert.deepEqual((await (await ask()).json()).quotes,[]);assert.equal(h.calls.length,1);
 assert.deepEqual((await (await ask()).json()).quotes,[]);assert.equal(h.calls.length,1);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM quote_cache').get().n,1);
});

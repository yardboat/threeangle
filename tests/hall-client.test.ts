import test from 'node:test';
import assert from 'node:assert/strict';
import {readTriangleResponse,sameWork,screenFromSearch,screenUrl,sameScreen,parentScreen} from '../lib/hall-client';
import {dropRejected} from '../lib/corner-schema';
import {STEPS,stepOf,lightFor,sameFocus} from '../lib/triangle-focus';
const topic={id:'custom-test',name:'A connection',works:[{title:'One',creator:'A'},{title:'Two',creator:'B'},{title:'Three',creator:'C'}]};
function streamed(chunks:string[]){const bytes=new TextEncoder();return new Response(new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(bytes.encode(chunk));c.close();}}),{headers:{'content-type':'application/x-ndjson'}});}
test('reads fragmented streamed status, heartbeat and a final result without trailing newline',async()=>{
 const text=JSON.stringify({type:'result',topic}),status:string[]=[];
 const r=streamed(['{"type":"sta','tus","text":"Researching"}\n{"type":"heartbeat"}\n',text.slice(0,50),text.slice(50)]);
 assert.deepEqual(await readTriangleResponse(r,s=>status.push(s)),topic);assert.deepEqual(status,['Researching']);
});
test('restores a cached JSON result without assuming it is a stream',async()=>assert.deepEqual(await readTriangleResponse(Response.json({topic}),()=>{}),topic));
test('surfaces streamed provider failure and premature stream close',async()=>{
 await assert.rejects(readTriangleResponse(streamed(['{"type":"error","error":"Research unavailable"}\n']),()=>{}),/Research unavailable/);
 await assert.rejects(readTriangleResponse(streamed(['{"type":"heartbeat"}\n']),()=>{}),/interrupted/);
});
test('rejects incomplete results and preserves API error messages',async()=>{
 await assert.rejects(readTriangleResponse(Response.json({topic:{name:'Incomplete'}}),()=>{}),/incomplete/);
 await assert.rejects(readTriangleResponse(Response.json({error:'Confirm your work again'},{status:404}),()=>{}),/Confirm your work again/);
});
test('a second angle only reuses a confirmation when title, creator and format match',()=>{
 const a={title:' Dune ',creator:'Frank Herbert',format:'Book'};
 assert.equal(sameWork(a,{...a,title:'dune'}),true);
 assert.equal(sameWork(a,{...a,format:'Movie'}),false);
 assert.equal(sameWork(a,{...a,creator:'Denis Villeneuve'}),false);
});
test('screens round-trip through the address bar',()=>{
 assert.deepEqual(screenFromSearch(''),{s:'welcome'});
 assert.deepEqual(screenFromSearch('?start=title'),{s:'find'});
 assert.deepEqual(screenFromSearch('?triangle=custom-abc'),{s:'reveal',id:'custom-abc'});
 for(const screen of [{s:'welcome'},{s:'find'},{s:'reveal',id:'river fever'}] as const)assert.deepEqual(screenFromSearch(screenUrl(screen).replace('/v2','')),screen);
 assert.equal(sameScreen({s:'confirm',c:1},{s:'confirm',c:1}),true);
 assert.equal(sameScreen({s:'confirm',c:1},{s:'confirm',c:2}),false);
 assert.deepEqual(parentScreen({s:'confirm',c:0}),{s:'find'});
 assert.deepEqual(parentScreen({s:'reveal',id:'x'}),{s:'welcome'});
});
test('works the visitor ruled out are not offered again, whatever the punctuation',()=>{
 const found=[{title:'Dune',creator:'Frank Herbert'},{title:'Dune',creator:'Denis Villeneuve'},{title:'Dune: Part Two',creator:'Denis Villeneuve'}];
 assert.deepEqual(dropRejected(found,[{title:'dune!',creator:'frank herbert'}]).map(m=>m.creator),['Denis Villeneuve','Denis Villeneuve']);
 assert.equal(dropRejected(found,[]).length,3);
 assert.equal(dropRejected(found,[{title:'Dune',creator:''}]).length,1);
});
test('the triangle is walked corner, side, corner, side, corner, side, centre',()=>{
 assert.deepEqual(STEPS.map(s=>s.kind),['vertex','edge','vertex','edge','vertex','edge','center']);
 assert.equal(stepOf(null),-1);assert.equal(stepOf({kind:'edge',index:2}),5);assert.equal(stepOf({kind:'center'}),6);
 assert.equal(sameFocus({kind:'vertex',index:1},{kind:'edge',index:1}),false);
 // a corner lights its two sides; a side lights its two corners; the centre lights everything
 const corner=lightFor({kind:'vertex',index:0});assert.deepEqual([...corner.sides].sort(),[0,2]);
 const side=lightFor({kind:'edge',index:2});assert.deepEqual([...side.corners].sort(),[0,2]);
 assert.equal(lightFor({kind:'center'}).sides.size,3);assert.equal(lightFor(null).corners.size,0);
});

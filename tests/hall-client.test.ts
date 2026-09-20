import test from 'node:test';
import assert from 'node:assert/strict';
import {readTriangleResponse,sameWork} from '../lib/hall-client';
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

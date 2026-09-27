import {timingSafeEqual} from 'node:crypto';
import {after} from 'next/server';
import {runArtCheck,runSearchCheck} from '@/lib/art-cases';
import {hasTmdb} from '@/lib/catalog';
import {curatedFills} from '@/lib/backfill';
import {crateDb} from '@/db/crate';
import {describe,searchCatalog} from '@/lib/catalog';
import {buildTriangle} from '@/lib/agent';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

// Operator checks that need the live network: GET /api/admin/check?suite=art|search|backfill&token=<ADMIN_TOKEN>.
// suite=build&q=<title>[&i=<what you loved>] finds the title in the catalogs and builds a triangle end to end,
// in the background; read the result with suite=runs.
// suite=runs returns the latest recorded model runs (traces, no user data beyond titles).
// suite=backfill returns the curated covers; save the JSON and apply it with scripts/backfill-art.ts <file>.
// Off unless ADMIN_TOKEN is set on the project.
const allowed=(token:string)=>{const want=process.env.ADMIN_TOKEN||'';if(want.length<24)return false;const a=Buffer.from(want),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b)};
export async function GET(request:Request){
 const q=new URL(request.url).searchParams;
 if(!allowed(q.get('token')||''))return new Response('Not found',{status:404});
 const suite=q.get('suite')||'art',started=Date.now();
 // A build outlives most HTTP clients: it runs after the response and its result lands in suite=runs (status 'selftest').
 if(suite==='build'){const title=q.get('q')||'',interest=q.get('i')||'';after(async()=>{const r=await selfBuild(title,interest);try{await crateDb().prepare('INSERT INTO generation_call (id,model,created_at,status,response) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),'selftest',Date.now(),'selftest',JSON.stringify({title,...r})).run()}catch{}});return Response.json({suite,started:true,title},{headers:{'Cache-Control':'no-store'}});}
 const data=suite==='runs'?(await crateDb().prepare('SELECT created_at,model,status,response FROM generation_call ORDER BY created_at DESC LIMIT ?').bind(Math.min(30,Number(q.get('n'))||10)).all()).results.map(r=>({...r,response:JSON.parse(String(r.response||'null'))})):suite==='search'?await runSearchCheck(q.get('q')?[q.get('q')!.slice(0,200)]:undefined):suite==='backfill'?await curatedFills():await runArtCheck();
 return Response.json({suite,ms:Date.now()-started,tmdb:hasTmdb(),data},{headers:{'Cache-Control':'no-store'}});
}

async function selfBuild(title:string,interest:string){
 const t0=Date.now();const [c]=await searchCatalog(title.slice(0,200));if(!c)return {error:'no catalog match',ms:Date.now()-t0};
 const searched=Date.now()-t0;
 const seed={title:c.title,creator:c.creator||'Unknown',format:c.format,year:c.year,description:await describe(c),source:0,facts:[],...(c.image?{image:c.image}:{})};
 const progress:{at:number;text:string}[]=[];const t1=Date.now();
 try{
  const built=await buildTriangle(seed,interest.slice(0,600),[{title:c.title,url:c.url}],[],text=>progress.push({at:Date.now()-t1,text}));
  return {seed:{title:seed.title,creator:seed.creator,format:seed.format},ms:{search:searched,build:Date.now()-t1},progress,name:built.output.name,works:built.output.works.map(w=>({title:w.title,creator:w.creator,format:w.format,image:(w as {image?:string}).image||null,url:built.sources[w.source]?.url}))};
 }catch(e){return {seed:{title:seed.title,format:seed.format},ms:{search:searched,build:Date.now()-t1},progress,error:e instanceof Error?e.message:'unknown'}}
}

import {timingSafeEqual} from 'node:crypto';
import {runArtCheck,runSearchCheck} from '@/lib/art-cases';
import {hasTmdb} from '@/lib/catalog';
import {curatedFills} from '@/lib/backfill';
import {crateDb} from '@/db/crate';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

// Operator checks that need the live network: GET /api/admin/check?suite=art|search|backfill&token=<ADMIN_TOKEN>.
// suite=runs returns the latest recorded model runs (traces, no user data beyond titles).
// suite=backfill returns the curated covers; save the JSON and apply it with scripts/backfill-art.ts <file>.
// Off unless ADMIN_TOKEN is set on the project.
const allowed=(token:string)=>{const want=process.env.ADMIN_TOKEN||'';if(want.length<24)return false;const a=Buffer.from(want),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b)};
export async function GET(request:Request){
 const q=new URL(request.url).searchParams;
 if(!allowed(q.get('token')||''))return new Response('Not found',{status:404});
 const suite=q.get('suite')||'art',started=Date.now();
 const data=suite==='runs'?(await crateDb().prepare('SELECT created_at,model,status,response FROM generation_call ORDER BY created_at DESC LIMIT ?').bind(Math.min(30,Number(q.get('n'))||10)).all()).results.map(r=>({...r,response:JSON.parse(String(r.response||'null'))})):suite==='search'?await runSearchCheck(q.get('q')?[q.get('q')!.slice(0,200)]:undefined):suite==='backfill'?await curatedFills():await runArtCheck();
 return Response.json({suite,ms:Date.now()-started,tmdb:hasTmdb(),data},{headers:{'Cache-Control':'no-store'}});
}

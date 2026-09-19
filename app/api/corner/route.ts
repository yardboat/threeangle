import {identifyWork,buildTriangle,isAgentReady} from '@/lib/agent';
import {sessionIdentity,ensureSession} from '@/lib/session';
import {crateDb} from '@/db/crate';
import {CornerError} from '@/lib/gemini';
import {resultSchema,requireSource,cornerIndex,type Lookup} from '@/lib/corner-schema';
import type {Topic} from '@/lib/stories';
import {z} from 'zod';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
function userOf(r:Request){return sessionIdentity(r)}
async function quota(user:string,kind:string,limit:number){
// Daily limit is off while the link is private. Set QUOTA_ENFORCED=1 to turn it back on before a public launch.
if(process.env.QUOTA_ENFORCED!=='1')return;
 const day=new Date().toISOString().slice(0,10),db=crateDb();
 // Atomic per-scope reservations. Failed provider calls still consume a slot.
 for(const [scope,max] of [[`${kind}:${user}:${day}`,limit],[`${kind}:all:${day}`,limit*10]] as const){
 const r=await db.prepare('INSERT INTO corner_usage (scope,count) VALUES (?,1) ON CONFLICT(scope) DO UPDATE SET count=corner_usage.count+1 WHERE corner_usage.count < ? RETURNING count').bind(scope,max).first();
 if(!r)throw new CornerError('Today’s custom-triangle limit has been reached. Come back tomorrow, or explore the curated topics.',429);
 }
}
export async function GET(request:Request){
 const user=userOf(request);const id=new URL(request.url).searchParams.get('id');
 if(!id)return ensureSession(request,reply({ready:isAgentReady()&&Boolean(process.env.DATABASE_URL||process.env.ThreeangleSto_DATABASE_URL||process.env.ThreeangleSto_POSTGRES_URL||process.env.ThreeangleSto_POSTGRES_PRISMA_URL||process.env.ThreeangleSto_DATABASE_URL_UNPOOLED||process.env.ThreeangleSto_POSTGRES_URL_NON_POOLING),signedIn:true}));
 if(!user)return reply({error:'Open this triangle in the browser where you created it.'},401);
 try{const row=await crateDb().prepare('SELECT result,status FROM corner_draft WHERE id=? AND user_id=?').bind(id,user).first<{result:string|null;status:string}>();if(!row)return reply({error:'That custom triangle was not found.'},404);return reply({topic:row.result?JSON.parse(row.result):null,status:row.status});}catch{return reply({error:'Your triangle could not be loaded. Please try again.'},503)}
}
const inputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('lookup'),title:z.string().trim().min(2).max(240)}),
 z.object({action:z.literal('generate'),id:z.string().uuid(),choice:z.number().int().min(0).max(2),interest:z.string().trim().max(600)})
]);
export async function POST(request:Request){
 const user=userOf(request);if(!user)return reply({error:'Please reload to start your private browser session.'},401);
 if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))return reply({error:'Please start from threeangle.'},403);
 if(!isAgentReady())return reply({error:'Custom triangles are not available yet. You can still explore the curated topics.'},503);
 try{
 const raw=await request.text();if(raw.length>3000)return reply({error:'Please use a shorter title or note.'},400);
 const parsed=inputSchema.safeParse(JSON.parse(raw));if(!parsed.success)return reply({error:'Check your title or selection and try again.'},400);const input=parsed.data;
 if(input.action==='lookup'){
 await quota(user,'lookup',10);
 const lookup=await identifyWork(input.title);
 await crateDb().prepare('INSERT INTO corner_draft (id,user_id,lookup,status,updated_at) VALUES (?,?,?,\'ready\',?)').bind(lookup.id,user,JSON.stringify(lookup),Date.now()).run();return reply(lookup);
 }
 const db=crateDb();const row=await db.prepare('SELECT lookup,result,status,updated_at FROM corner_draft WHERE id=? AND user_id=?').bind(input.id,user).first<{lookup:string;result:string|null;status:string;updated_at:number}>();
 if(!row)return reply({error:'Please find and confirm your title again.'},404);
 if(row.result)return reply({topic:JSON.parse(row.result)});
 const lookup=JSON.parse(row.lookup) as Lookup,seed=lookup.matches[input.choice];if(!seed)return reply({error:'Choose one of the confirmed titles.'},400);
 const lock=await db.prepare("UPDATE corner_draft SET status='generating',updated_at=? WHERE id=? AND user_id=? AND (status!='generating' OR updated_at < ?) RETURNING id").bind(Date.now(),input.id,user,Date.now()-240000).first();
 if(!lock)return reply({error:'This triangle is already being researched. Give it a moment before trying again.'},409);
 try{await quota(user,'generate',3)}catch(e){await db.prepare("UPDATE corner_draft SET status='ready' WHERE id=? AND user_id=?").bind(input.id,user).run();throw e}
 const encoder=new TextEncoder();
 const stream=new ReadableStream({async start(controller){
 let connected=true;const send=(data:unknown)=>{if(connected)try{controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'))}catch{connected=false}};
 const timer=setInterval(()=>send({type:'heartbeat'}),10000);
 try{
 send({type:'status',text:'Finding the other two corners.'});
 const built=await buildTriangle(seed,input.interest,lookup.sources);
const sources=built.sources;
const result=resultSchema.parse(built.output);const works=result.works.map(w=>({...w,url:requireSource(sources,w.source).url}));
 const slot=cornerIndex(seed.format);if(works[slot].title.toLowerCase().trim()!==seed.title.toLowerCase().trim()||works[slot].creator.toLowerCase().trim()!==seed.creator.toLowerCase().trim()||works[slot].format!==seed.format)throw new Error('Seed was changed');works[slot]={...works[slot],title:seed.title,creator:seed.creator,format:seed.format,url:requireSource(lookup.sources,seed.source).url};
 if(new Set(works.map(w=>w.title.toLowerCase().replace(/\W/g,''))).size!==4||!['Book','Article'].includes(works[0].format)||!['Movie','Documentary','Show'].includes(works[1].format)||works[2].format!=='Podcast episode')throw new Error('Invalid media triangle');
 const topic:Topic={...result,id:'custom-'+input.id,title:result.name,pilotIndex:24,color:'#dfff00',works,sources,searchHtml:lookup.searchHtml,seedTitle:seed.title};
 await db.prepare("UPDATE corner_draft SET result=?,status='complete',updated_at=? WHERE id=? AND user_id=?").bind(JSON.stringify(topic),Date.now(),input.id,user).run();send({type:'result',topic});
 }catch(e){console.error('Custom triangle failed',e instanceof Error?e.name:'unknown');await db.prepare("UPDATE corner_draft SET status='ready',updated_at=? WHERE id=? AND user_id=?").bind(Date.now(),input.id,user).run();send({type:'error',error:e instanceof CornerError?e.message:'We couldn’t complete a well-supported triangle. Please try again.'});}
 finally{clearInterval(timer);if(connected)try{controller.close()}catch{}}
 }});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){if(e instanceof CornerError)return reply({error:e.message},e.status);if(e instanceof SyntaxError)return reply({error:'Check your input and try again.'},400);console.error('Corner request failed',e instanceof Error?e.name:'unknown',(e as {code?:string}).code??'',e instanceof Error?e.message.slice(0,200):'');return reply({error:'We couldn’t finish that research. Try adding the creator or a more specific title.'},503)}
}

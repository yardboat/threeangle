import {identifyWork,buildTriangle,isAgentReady} from '@/lib/agent';
import {sessionIdentity,ensureSession} from '@/lib/session';
import {crateDb} from '@/db/crate';
import {CornerError} from '@/lib/corner-error';
import {overLimit,tooMany} from '@/lib/limit';
import {describe,readCandidate} from '@/lib/catalog';
import {resultSchema,requireSource,cornerIndex,lookupHintsSchema,type Lookup} from '@/lib/corner-schema';
import type {Topic} from '@/lib/stories';
import {z} from 'zod';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const hostOf=(u:string)=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u}};
const databaseReady=()=>Boolean(process.env.DATABASE_URL||process.env.ThreeangleSto_DATABASE_URL||process.env.ThreeangleSto_POSTGRES_URL||process.env.ThreeangleSto_POSTGRES_PRISMA_URL||process.env.ThreeangleSto_DATABASE_URL_UNPOOLED||process.env.ThreeangleSto_POSTGRES_URL_NON_POOLING);

// GET                -> is the custom-triangle service ready (and starts a session)
// GET ?id=<draft id>  -> a finished triangle. Anyone with the link can read it; `owner` says whether it is yours.
export async function GET(request:Request){
 const user=sessionIdentity(request);const id=new URL(request.url).searchParams.get('id');
 if(!id)return ensureSession(request,reply({ready:isAgentReady()&&databaseReady(),signedIn:true}));
 if(!/^[0-9a-f-]{36}$/.test(id))return reply({error:'That custom triangle was not found.'},404);
 try{
  const row=await crateDb().prepare('SELECT result,status,user_id FROM corner_draft WHERE id=?').bind(id).first<{result:string|null;status:string;user_id:string}>();
  const owner=Boolean(row&&user&&row.user_id===user);
  if(!row||(!row.result&&!owner))return reply({error:'That custom triangle was not found.'},404);
  return ensureSession(request,reply({topic:row.result?JSON.parse(row.result):null,status:row.status,owner}));
 }catch{return reply({error:'Your triangle could not be loaded. Please try again.'},503)}
}
const inputSchema=z.discriminatedUnion('action',[
 // The fast path: a work confirmed from the catalog typeahead (a signed search result).
 z.object({action:z.literal('pick'),token:z.string().min(20).max(8000)}),
 // "Find another angle": start again from the work a finished triangle began with.
 z.object({action:z.literal('reuse'),topicId:z.string().regex(/^custom-[0-9a-f-]{36}$/)}),
 // The fallback: web research for a work the catalogs don't carry ("Help us find it").
 z.object({action:z.literal('lookup'),title:z.string().trim().min(2).max(240)}).merge(lookupHintsSchema),
 z.object({action:z.literal('generate'),id:z.string().uuid(),choice:z.number().int().min(0).max(2),interest:z.string().trim().max(600),avoid:z.array(z.string().max(300)).max(8).optional()})
]);
async function saveDraft(lookup:Lookup,user:string){await crateDb().prepare('INSERT INTO corner_draft (id,user_id,lookup,status,updated_at) VALUES (?,?,?,\'ready\',?)').bind(lookup.id,user,JSON.stringify(lookup),Date.now()).run();}
export async function POST(request:Request){
 const user=sessionIdentity(request);if(!user)return reply({error:'Please reload to start your private browser session.'},401);
 if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))return reply({error:'Please start from threeangle.'},403);
 if(!isAgentReady())return reply({error:'Custom triangles are not available yet. You can still explore the curated topics.'},503);
 try{
 const raw=await request.text();if(raw.length>9000)return reply({error:'Please use a shorter title or note.'},400);
 const parsed=inputSchema.safeParse(JSON.parse(raw));if(!parsed.success)return reply({error:'Check your title or selection and try again.'},400);const input=parsed.data;
 if(input.action==='pick'){
  if(overLimit(request,'pick',30))return tooMany();
  const c=readCandidate(input.token);if(!c)return reply({error:'Please choose your work again.'},400);
  const lookup:Lookup={id:crypto.randomUUID(),matches:[{title:c.title,creator:c.creator||'Unknown',format:c.format,year:c.year,description:await describe(c),source:0,facts:[],...(c.image?{image:c.image}:{})}],sources:[{title:c.title+' — '+hostOf(c.url),url:c.url}],searchHtml:[]};
  await saveDraft(lookup,user);return reply(lookup);
 }
 if(input.action==='reuse'){
  const row=await crateDb().prepare('SELECT lookup,result FROM corner_draft WHERE id=?').bind(input.topicId.slice(7)).first<{lookup:string;result:string|null}>();
  if(!row?.result)return reply({error:'That custom triangle was not found.'},404);
  const old=JSON.parse(row.lookup) as Lookup,topic=JSON.parse(row.result) as Topic;
  const choice=Math.max(0,old.matches.findIndex(m=>m.title===topic.seedTitle));
  const lookup={...old,id:crypto.randomUUID()};await saveDraft(lookup,user);return reply({...lookup,choice});
 }
 if(input.action==='lookup'){
  const lookup=await identifyWork(input.title,{creator:input.creator||undefined,year:input.year||undefined,format:input.format,exclude:input.exclude});
  await saveDraft(lookup,user);return reply(lookup);
 }
 const db=crateDb();const row=await db.prepare('SELECT lookup,result,status,updated_at FROM corner_draft WHERE id=? AND user_id=?').bind(input.id,user).first<{lookup:string;result:string|null;status:string;updated_at:number}>();
 if(!row)return reply({error:'Please find and confirm your title again.'},404);
 if(row.result)return reply({topic:JSON.parse(row.result)});
 const lookup=JSON.parse(row.lookup) as Lookup,seed=lookup.matches[input.choice];if(!seed)return reply({error:'Choose one of the confirmed titles.'},400);
 const lock=await db.prepare("UPDATE corner_draft SET status='generating',updated_at=? WHERE id=? AND user_id=? AND (status!='generating' OR updated_at < ?) RETURNING id").bind(Date.now(),input.id,user,Date.now()-240000).first();
 if(!lock)return reply({error:'This triangle is already being researched. Give it a moment before trying again.'},409);
 const encoder=new TextEncoder();
 const stream=new ReadableStream({async start(controller){
  let connected=true;const send=(data:unknown)=>{if(connected)try{controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'))}catch{connected=false}};
  const timer=setInterval(()=>send({type:'heartbeat'}),10000);
  try{
   send({type:'status',text:'Finding the other two corners.'});
   // A triangle should never fail: if a whole build breaks early enough, it runs once more before the visitor hears about it.
   const began=Date.now(),progress=(text:string)=>send({type:'status',text});
   const built=await buildTriangle(seed,input.interest,lookup.sources,input.avoid||[],progress).catch(e=>{
    if(Date.now()-began>140000)throw e;
    console.warn('Build retry after',e instanceof Error?e.name+': '+e.message.slice(0,160):'unknown');progress('Taking another path to it.');
    return buildTriangle(seed,input.interest,lookup.sources,input.avoid||[],progress);
   });
   const sources=built.sources;
   const result=resultSchema.parse(built.output);const works=result.works.map(w=>({...w,url:requireSource(sources,w.source).url}));
   // The confirmed work always keeps its exact identity in its slot.
   const slot=cornerIndex(seed.format);works[slot]={...works[slot],title:seed.title,creator:seed.creator,format:seed.format,url:requireSource(lookup.sources,seed.source).url};
   // Checked, but a small slip is logged rather than thrown away: the works were already confirmed by slot.
   if(new Set(works.map(w=>w.title.toLowerCase().replace(/\W/g,''))).size!==4||!['Book','Article'].includes(works[0].format)||!['Movie','Documentary','Show'].includes(works[1].format)||!(works[2].format==='Podcast episode'||(works[2].format==='Album'&&seed.format==='Album')))console.warn('Triangle shape check',JSON.stringify(works.map(w=>[w.title,w.format])));
   const topic:Topic={...result,id:'custom-'+input.id,title:result.name,pilotIndex:24,color:'#dfff00',works,sources,searchHtml:lookup.searchHtml,seedTitle:seed.title};
   await db.prepare("UPDATE corner_draft SET result=?,status='complete',updated_at=? WHERE id=? AND user_id=?").bind(JSON.stringify(topic),Date.now(),input.id,user).run();send({type:'result',topic});
  }catch(e){console.error('Custom triangle failed',e instanceof Error?e.name+': '+e.message.slice(0,300):'unknown');await db.prepare("UPDATE corner_draft SET status='ready',updated_at=? WHERE id=? AND user_id=?").bind(Date.now(),input.id,user).run();send({type:'error',error:e instanceof CornerError?e.message:'We couldn’t complete a well-supported triangle. Please try again.'});}
  finally{clearInterval(timer);if(connected)try{controller.close()}catch{}}
 }});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){if(e instanceof CornerError)return reply({error:e.message},e.status);if(e instanceof SyntaxError)return reply({error:'Check your input and try again.'},400);console.error('Corner request failed',e instanceof Error?e.name:'unknown',(e as {code?:string}).code??'',e instanceof Error?e.message.slice(0,200):'');return reply({error:'We couldn’t finish that research. Try adding the creator or a more specific title.'},503)}
}

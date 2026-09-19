import {calibrationFor,RESEARCH_BRIEF,EDITORIAL_VERSION} from '@/lib/editorial';
import {sessionIdentity,ensureSession} from '@/lib/session';
import {crateDb} from '@/db/crate';
import {gemini,isGeminiReady,parseJson,CornerError} from '@/lib/gemini';
import {lookupSchema,resultSchema,requireSource,cornerIndex,type Lookup} from '@/lib/corner-schema';
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
 if(!id)return ensureSession(request,reply({ready:isGeminiReady()&&Boolean(process.env.DATABASE_URL||process.env.ThreeangleSto_DATABASE_URL||process.env.ThreeangleSto_POSTGRES_URL||process.env.ThreeangleSto_POSTGRES_PRISMA_URL||process.env.ThreeangleSto_DATABASE_URL_UNPOOLED||process.env.ThreeangleSto_POSTGRES_URL_NON_POOLING),signedIn:true}));
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
 if(!isGeminiReady())return reply({error:'Custom triangles are not available yet. You can still explore the curated topics.'},503);
 try{
 const raw=await request.text();if(raw.length>3000)return reply({error:'Please use a shorter title or note.'},400);
 const parsed=inputSchema.safeParse(JSON.parse(raw));if(!parsed.success)return reply({error:'Check your title or selection and try again.'},400);const input=parsed.data;
 if(input.action==='lookup'){
 await quota(user,'lookup',10);
 const research=await gemini(`Identify up to three real works matching this user title: ${JSON.stringify(input.title)}. Search official publisher, author, film or podcast pages. Include title, creator, year, format and a short identifying description for each. For podcasts identify a SPECIFIC episode, never substitute a whole feed; if ambiguous give specific candidates or ask for episode title by returning no matches. For each match, find two or three surprising factual details about its subject, supported by sources. Do not guess if no match.`,true);
 const shaped=await gemini(`Convert this research into JSON. Return {"matches":[{"title":"...","creator":"...","format":"Book|Article|Movie|Documentary|Show|Podcast episode","year":"...","description":"...","source":0,"facts":[{"text":"One sourced factual detail, under 45 words","source":0}]}]}. Maximum three matches and three facts per match. Source is a zero-based index from SOURCES and must support that exact work or fact. Omit unsupported facts. No match => empty matches.\nSOURCES: ${JSON.stringify(research.sources)}\nRESEARCH: ${research.text}`,false,4500);
 const {matches}=lookupSchema.parse(parseJson(shaped.text));for(const m of matches){requireSource(research.sources,m.source);m.facts.forEach(f=>requireSource(research.sources,f.source));}
 const lookup:Lookup={id:crypto.randomUUID(),matches,sources:research.sources,searchHtml:research.html?[research.html]:[]};
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
 const calibration=calibrationFor(seed.title,input.interest);
 const researched=await gemini(`${RESEARCH_BRIEF}\nCALIBRATION EXAMPLES (voice and judgment only, not evidence): ${calibration}\n\nTASK: Build one finished threeangle around this CONFIRMED WORK: ${JSON.stringify(seed)}. What grabbed the user (optional): ${JSON.stringify(input.interest)}.\nUse Google Search to verify every title, creator, format and exact podcast episode before including it; never include a work you could not verify. The confirmed work keeps its exact title, creator and format and belongs in slot ${cornerIndex(seed.format)} (zero-based); it must not recur in the other slots or the bonus. The three main works MUST be ordered read, watch, listen: one written work, one movie/documentary/show and one specific podcast episode (never a whole series), plus a distinct bonus. Only choose the other two main formats. No adaptations of the same work and no duplicate works. Prefer one-off episodes from The Daily, 99% Invisible, Radiolab or This American Life, but choose another show when a much better fit. Do not invent sources, facts or praise.\nEvery work needs "url": an official https page (publisher, filmmaker or distributor, broadcaster or official episode page) that you found in search.\nIf evidence cannot support a full triangle, return only {"status":"needs_more_research","reason":"Short precise user-facing limitation"} or {"status":"needs_clarification","reason":"One focused question"}.\nOtherwise return ONLY one JSON object, with no prose and no code fences, and every field required. Main pitches 45\u201370 words; payoff 65\u2013100 words; other paragraphs under 55 words; headings under 9 words. Bridges must cover read-watch, watch-listen and listen-read. Exactly three strings in each array and four works. Avoid vague wonder and claims of personal consumption. Shape:\n{"name":"Specific topic name","kicker":"TOPIC / FOCUS","hook":"A punchy invitation","intro":"A concrete teaser","heads":["Read pitch headline","Watch pitch headline","Listen pitch headline"],"bridges":["What the next work adds","What the next work adds","Why these three belong together"],"shift":"The insight","payoff":"Explain the three-way connection specifically","question":"A thought-provoking question","angles":["Lens 1","Lens 2","Lens 3"],"answers":["Answer through work 1","Answer through work 2","Answer through work 3"],"bonus":"A fourth tangent headline","works":[{"title":"Exact work title","creator":"Creator","format":"Book or Article","pitch":"Specific enthusiastic pitch","url":"https://..."},{"title":"...","creator":"...","format":"Movie or Documentary or Show","pitch":"...","url":"https://..."},{"title":"Exact episode title","creator":"Podcast / host","format":"Podcast episode","pitch":"...","url":"https://..."},{"title":"Bonus","creator":"...","format":"...","pitch":"...","url":"https://..."}]}\nEDITORIAL VERSION: ${EDITORIAL_VERSION}`,true,10000);
send({type:'status',text:'Checking sources and shaping your threeangle.'});
const sources=[...lookup.sources,...researched.sources];
const shapedOutput=parseJson(researched.text) as {works?:{url?:string;source?:number}[]};
const rawWorks=Array.isArray(shapedOutput?.works)?shapedOutput.works:[];
const modelUrls=rawWorks.map(w=>typeof w?.url==='string'?w.url:'');
const hostOf=(u:string)=>{try{return new URL(u).hostname.replace(/^www\./,'').toLowerCase()}catch{return ''}};
for(const w of rawWorks){const h=hostOf(w?.url||'');const i=h?sources.findIndex(s=>{const t=s.title.toLowerCase().replace(/^www\./,'');return t===h||h.endsWith('.'+t)||t.endsWith('.'+h)}):-1;if(i>=0)w.source=i;else delete w.source;}
 const limitation=z.object({status:z.enum(['needs_more_research','needs_clarification']),reason:z.string().trim().min(1).max(500)}).safeParse(shapedOutput);
 if(limitation.success)throw new CornerError(limitation.data.reason,422);
 if(rawWorks.length!==4||rawWorks.some(w=>typeof w?.source!=='number'))throw new CornerError('We couldn\u2019t verify sources for every recommended work. Please try again.',422);
const result=resultSchema.parse(shapedOutput);const works=result.works.map((w,i)=>({...w,url:/^https:\/\//.test(modelUrls[i])?modelUrls[i]:requireSource(sources,w.source).url}));
 const slot=cornerIndex(seed.format);if(works[slot].title.toLowerCase().trim()!==seed.title.toLowerCase().trim()||works[slot].creator.toLowerCase().trim()!==seed.creator.toLowerCase().trim()||works[slot].format!==seed.format)throw new Error('Seed was changed');works[slot]={...works[slot],title:seed.title,creator:seed.creator,format:seed.format,url:requireSource(lookup.sources,seed.source).url};
 if(new Set(works.map(w=>w.title.toLowerCase().replace(/\W/g,''))).size!==4||!['Book','Article'].includes(works[0].format)||!['Movie','Documentary','Show'].includes(works[1].format)||works[2].format!=='Podcast episode')throw new Error('Invalid media triangle');
 const topic:Topic={...result,id:'custom-'+input.id,title:result.name,pilotIndex:24,color:'#dfff00',works,sources,searchHtml:[...lookup.searchHtml,...(researched.html?[researched.html]:[])],seedTitle:seed.title};
 await db.prepare("UPDATE corner_draft SET result=?,status='complete',updated_at=? WHERE id=? AND user_id=?").bind(JSON.stringify(topic),Date.now(),input.id,user).run();send({type:'result',topic});
 }catch(e){console.error('Custom triangle failed',e instanceof Error?e.name:'unknown');await db.prepare("UPDATE corner_draft SET status='ready',updated_at=? WHERE id=? AND user_id=?").bind(Date.now(),input.id,user).run();send({type:'error',error:e instanceof CornerError?e.message:'We couldn’t complete a well-supported triangle. Please try again.'});}
 finally{clearInterval(timer);if(connected)try{controller.close()}catch{}}
 }});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){if(e instanceof CornerError)return reply({error:e.message},e.status);if(e instanceof SyntaxError)return reply({error:'Check your input and try again.'},400);console.error('Corner request failed',e instanceof Error?e.name:'unknown',(e as {code?:string}).code??'',e instanceof Error?e.message.slice(0,200):'');return reply({error:'We couldn’t finish that research. Try adding the creator or a more specific title.'},503)}
}

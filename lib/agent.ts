import {gateway,generateText,isStepCount,Output,type SystemModelMessage} from 'ai';
import {anthropic,createAnthropic} from '@ai-sdk/anthropic';
import {z} from 'zod';
import corpus from '../editorial/refined-24.json';
import {crateDb} from '@/db/crate';
import {EDITORIAL_SYSTEM,EDITORIAL_VERSION,RESEARCH_BRIEF,calibrationFor} from './editorial';
import {cornerIndex,dropRejected,FORMATS,type Lookup,type LookupHints,type Seed,type Source} from './corner-schema';
import {CornerError} from './corner-error';
import {formatOf,resolveWork,titleFit,type Candidate} from './catalog';
import {openPage} from './page';

// threeangle's triangle-building agent. With ANTHROPIC_API_KEY it calls Claude directly; otherwise it goes
// through Vercel AI Gateway (OIDC on Vercel, AI_GATEWAY_API_KEY locally). AGENT_MODEL overrides the model.
// Works are found in real catalogs (lib/catalog.ts); the model chooses and writes, it never supplies links.

const SLOTS=['read','watch','listen'] as const;
type Slot=(typeof SLOTS)[number];
const anthropicKey=()=>process.env.ANTHROPIC_API_KEY||process.env[Object.keys(process.env).find(k=>/anthropic/i.test(k)&&/key|token/i.test(k))||'']||'';
const direct=()=>Boolean(anthropicKey());
export const agentModel=()=>process.env.AGENT_MODEL||(direct()?'claude-sonnet-5':'anthropic/claude-haiku-4.5');
const languageModel=()=>direct()?createAnthropic({apiKey:anthropicKey()})(agentModel()):agentModel();
export const isAgentReady=()=>Boolean(process.env.ANTHROPIC_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL);
const noThinking={anthropic:{thinking:{type:'disabled' as const}}};
const cached={anthropic:{cacheControl:{type:'ephemeral' as const}}};

const normUrl=(u:string)=>{try{const x=new URL(u);return x.hostname.replace(/^www\./,'').toLowerCase()+x.pathname.replace(/\/+$/,'')}catch{return ''}};
const hostOf=(u:string)=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u}};
// Every https URL that appeared in tool results during a run. A recommended link must be one of these.
const urlsSeen=(steps:{content:unknown}[])=>new Set((JSON.stringify(steps.map(s=>s.content))||'').match(/https:\/\/[^\s"'\\<>)\]]+/g)?.map(normUrl).filter(Boolean)||[]);
const search=()=>direct()?anthropic.tools.webSearch_20250305({maxUses:3}):gateway.tools.exaSearch({type:'fast',numResults:6,contents:{highlights:true}});
const TOOL_RULES='TOOLS: web_search finds candidates and official pages; read exact titles, creators and episode names from its results. Only URLs you actually retrieved with these tools may appear in your answer. Never invent works, episodes, quotes or URLs.';

// ---------- helpers ----------
const httpsUrl=z.string().url().refine(u=>u.startsWith('https://'),'https only');
const providerError=(e:unknown)=>{
 const name=e instanceof Error?e.name:'unknown',message=e instanceof Error?e.message.slice(0,300):'';
 console.error('Agent call failed',name,message);
 if(name==='AI_NoObjectGeneratedError'){const x=e as {text?:string;cause?:{message?:string}};console.error('No object text',(x.text||'').slice(0,700),'cause',((x.cause&&x.cause.message)||'').slice(0,500))}
 return new CornerError(name==='TimeoutError'||name==='AbortError'?'The research took too long. Please try again.':'The research service could not finish. Please try again in a moment.');
};
async function recordRun(model:string,status:string,trace:unknown){
 try{await crateDb().prepare('INSERT INTO generation_call (id,model,created_at,status,response) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),model,Date.now(),status,JSON.stringify(trace).slice(0,200000)).run()}catch{}
}
const toolCounts=(steps:{toolCalls:{toolName:string}[]}[])=>{const counts:Record<string,number>={};for(const s of steps)for(const c of s.toolCalls)counts[c.toolName]=(counts[c.toolName]||0)+1;return counts};

// ---------- 1. identify a work the catalogs could not find (fallback: "Help us find it") ----------
const lookupOut=z.object({
 status:z.enum(['matches','none','clarify']),
 question:z.string().max(400).optional(),
 matches:z.array(z.object({title:z.string().min(1).max(240),creator:z.string().min(1).max(240),format:z.enum(FORMATS),year:z.string().max(40),description:z.string().min(1).max(1400),url:httpsUrl})).max(3)
});
function hintText(h:LookupHints={}){
 const parts:string[]=[];
 if(h.creator)parts.push(`The user says the creator (author, director, host or network) is ${JSON.stringify(h.creator)}.`);
 if(h.year)parts.push(`The user says it is from around ${JSON.stringify(h.year)}.`);
 if(h.format)parts.push(`The user says it is a ${h.format}; return only works of that format.`);
 if(h.exclude?.length)parts.push(`The user already looked at these candidates and said none of them is the one, so do NOT return them again: ${JSON.stringify(h.exclude)}. Look for what else this title could mean, including a work with the same title in another format or by another creator.`);
 return parts.length?'\n'+parts.join(' ')+'\n':'';
}
export async function identifyWork(title:string,hints:LookupHints={}):Promise<Lookup>{
 const model=agentModel(),started=Date.now();
 let result;
 try{
  result=await generateText({
   model:languageModel(),system:EDITORIAL_SYSTEM+'\n\n'+TOOL_RULES,tools:{web_search:search()},stopWhen:isStepCount(5),abortSignal:AbortSignal.timeout(60000),providerOptions:noThinking,
   output:Output.object({schema:lookupOut}),
   prompt:`Identify the work the user means. USER TITLE: ${JSON.stringify(title)}.${hintText(hints)}
Search official publisher, author, filmmaker, distributor or broadcaster pages and return up to three real works that could match, each with exact title, creator, format (${FORMATS.join(' | ')}), year, a factual dossier of at most 1200 characters drawn only from what you found in search (premise, principal cast and crew, tone, setting, what critics say it is really about, their most common comparisons, and the two to four distinct topics or readings the work supports; paraphrase, never quote), and an official https URL you retrieved. For a podcast identify a SPECIFIC episode, never a whole feed: if the user gave only a show or feed, return status "clarify" with one focused question asking which episode. If the title is ambiguous, return the candidates. An album is supported: return the album itself (creator = the artist). If the user gives a single song, return the album it appears on. If it is a game or another unsupported format, return status "clarify" and say that new threeangles start from a book, article, movie, documentary, TV show, podcast episode or album. If nothing real matches, return status "none" with no matches. Do not guess.`
  });
 }catch(e){await recordRun(model,'error',{phase:'identify',title,error:e instanceof Error?e.message:'unknown',ms:Date.now()-started});throw providerError(e)}
 const out=result.output;
 const seen=urlsSeen(result.steps);
 const kept=dropRejected((out.status==='matches'?out.matches:[]).filter(m=>seen.has(normUrl(m.url))),hints.exclude);
 await recordRun(model,out.status,{phase:'identify',title,tools:toolCounts(result.steps),returned:out.matches.length,kept:kept.length,ms:Date.now()-started,usage:result.usage});
 if(out.status==='clarify')throw new CornerError(out.question||'Could you add the creator or a more specific title?',422);
 // Covers for what the web search found, from the catalogs (a missing cover never blocks the answer).
 const art=await Promise.all(kept.map(m=>Promise.race([resolveWork(m).catch(()=>null),new Promise<null>(r=>setTimeout(()=>r(null),4000))])));
 const sources:Source[]=kept.map(m=>({title:m.title+' — '+hostOf(m.url),url:m.url}));
 const matches:Seed[]=kept.map((m,i)=>({title:m.title,creator:m.creator,format:m.format,year:m.year,description:m.description,source:i,facts:[],...(art[i]?.image?{image:art[i]!.image}:{})}));
 return {id:crypto.randomUUID(),matches,sources,searchHtml:[]};
}

// ---------- the official page of a work the catalogs don't carry (articles, older podcast episodes) ----------
const pageOut=z.object({url:httpsUrl.nullable(),title:z.string().max(300).optional(),publisher:z.string().max(200).optional()});
async function findOnWeb(q:{title:string;creator:string;format:string}):Promise<Candidate|null>{
 const f=formatOf(q.format);if(f!=='Article'&&f!=='Podcast episode')return null;
 try{
  const r=await generateText({
   model:languageModel(),system:TOOL_RULES,tools:{web_search:search()},stopWhen:isStepCount(3),abortSignal:AbortSignal.timeout(35000),providerOptions:noThinking,
   output:Output.object({schema:pageOut}),
   prompt:`Find the official web page of this ${f==='Article'?'article (on the publication that ran it)':'podcast episode (on the show\'s own site, or its Apple Podcasts or Spotify page)'}: ${JSON.stringify(q)}. Return its https URL exactly as it appeared in your search results, with the exact title and the publisher or show. If you cannot find this exact ${f==='Article'?'article':'episode'}, return url null.`
  });
  const url=r.output.url;if(!url||!urlsSeen(r.steps).has(normUrl(url)))return null;
  const p=await openPage(url,600);
  const title=r.output.title||p.title||q.title;
  if(titleFit(q.title,title)<.6&&titleFit(q.title,p.title||'')<.6)return null;
  return {title:q.title,creator:q.creator||r.output.publisher||p.site||hostOf(url),format:f,year:(p.published||'').slice(0,4),description:(p.description||'').slice(0,600),url:p.ok?p.url:url,image:p.image?.startsWith('https://')?p.image:undefined,from:'web'};
 }catch(e){console.error('Web lookup failed',e instanceof Error?e.name:'unknown');return null}
}
export async function resolveCorner(q:{title:string;creator:string;format:string}):Promise<Candidate|null>{
 return (await resolveWork(q).catch(()=>null))||findOnWeb(q);
}

// ---------- 2. build the triangle ----------
const cornerOut=z.object({slot:z.string(),title:z.string().min(1),creator:z.string().min(1),format:z.string().min(1),contribution:z.string().optional()});
const proposalOut=z.object({
 status:z.enum(['ok','needs_more_research','needs_clarification']),
 reason:z.string().optional(),
 topic:z.string().optional(),
 insight:z.string().optional(),
 corners:z.array(cornerOut).optional(),
 bonus:z.object({title:z.string().min(1),creator:z.string().min(1),format:z.string().min(1),addedValue:z.string().optional()}).optional()
});
const line=z.string().trim().min(1).max(1400);
const writerOut=z.object({name:line,kicker:line,hook:line,intro:line,heads:z.array(line).min(3),bridges:z.array(line).min(3),shift:line,payoff:line,question:line,angles:z.array(line).min(3),answers:z.array(line).min(3),bonus:line,works:z.array(z.object({title:line,creator:line,format:line,pitch:line})).min(4)});
const FORMAT_OF:Record<Slot,string[]>={read:['Book','Article'],watch:['Movie','Documentary','Show'],listen:['Podcast episode']};
const SLOT_NAME:Record<Slot|'bonus',string>={read:'the read',watch:'the watch',listen:'the listen',bonus:'the bonus'};
type Pick={slot:Slot|'bonus';title:string;creator:string;format:string};

export type BuildProgress=(text:string)=>void;
export async function buildTriangle(seed:Seed,interest:string,baseSources:Source[],avoid:string[]=[],onProgress:BuildProgress=()=>{}){
 const model=agentModel(),started=Date.now();
 const seedUrl=baseSources[seed.source]?.url||'';
 const slot=SLOTS[cornerIndex(seed.format)];
 const missing=SLOTS.filter(s=>s!==slot);
 const references=process.env.AGENT_ALL_REFERENCES==='1'?JSON.stringify(corpus):calibrationFor(seed.title,interest);
 const seedInfo={title:seed.title,creator:seed.creator,format:seed.format,year:seed.year,description:seed.description};
 // One shared, cached prefix for every call in this build: the editor's brief and the reference triangles.
 const system:SystemModelMessage[]=[{role:'system',content:EDITORIAL_SYSTEM},{role:'system',content:`REFERENCE TRIANGLES (voice and judgment only, never evidence; never copy their works or claims): ${references}`,providerOptions:cached}];
 const trace:Record<string,unknown>={phase:'build',model,seed:seed.title,attempts:[]};
 const seedArt=seed.image?Promise.resolve(seed.image):resolveWork(seed).then(c=>c?.image).catch(()=>undefined);
 let feedback='',rejected:string[]=[];
 for(let attempt=1;attempt<=3;attempt++){
  let result;
  try{
   result=await generateText({
    model:languageModel(),system,abortSignal:AbortSignal.timeout(90000),providerOptions:noThinking,
    output:Output.object({schema:proposalOut}),
    prompt:`${RESEARCH_BRIEF}

TASK: choose the two missing corners of one finished threeangle.
CONFIRMED WORK (keep exactly): ${JSON.stringify(seedInfo)}
This work was already confirmed in a catalog before you were called. Treat these details as established fact even if you do not recognize it (it may be newer than your training data). Never question that it exists and never return needs_more_research because it is unfamiliar; build around its description, creator, format and year.
It occupies the ${slot} slot. Missing slots: ${missing.join(' and ')}. The main slots are read (a book or article), watch (a movie, documentary or show) and listen (ONE specific podcast episode, never a series; the listen slot may also be an album, but only when the confirmed work is that album). Return exactly two corners, one for each missing slot, plus one distinct bonus that is a book, article, movie, documentary, show, podcast episode or album.
WHAT THE USER LOVED ABOUT IT (key input): ${interest?JSON.stringify(interest):'not stated'}.
${avoid.length?'TRY AGAIN: earlier triangles already used these works: '+JSON.stringify(avoid)+'. Choose a different reading of the confirmed work and entirely different works.\n':''}${rejected.length?'DO NOT USE: '+JSON.stringify(rejected)+'.\n':''}PROCESS: the confirmed work supports several readings. Choose ONE precise topic that holds the whole triangle together. When the user said what they loved about the work, that is the key input: the topic MUST grow directly out of it, and each corner must speak to it. Only when it is not stated, choose the reading with the strongest three works, state it in the topic field as one sentence, and choose corners that all serve it. Never ask the user to choose. Weigh candidates for each missing slot with the removal, substitution and connection tests, then choose. Choose only real, findable works with their exact published titles and the creator a catalog would list (author; director; for a show its creator; for a podcast episode the show's name). For the podcast only an episode you are certain exists, with its exact title. No links are needed. Prefer one-off episodes from The Daily, 99% Invisible, Radiolab or This American Life, but choose a different show when it contributes much more. No adaptations or sequels of the confirmed work and no repeated works. If a supported set is not possible, set status to needs_more_research or needs_clarification with a short user-facing reason and omit the other fields. Be brief: one sentence per field.${feedback}`
   });
  }catch(e){
   // A malformed pick costs one attempt, not the whole build.
   if(e instanceof Error&&e.name==='AI_NoObjectGeneratedError'&&attempt<3){(trace.attempts as unknown[]).push({attempt,status:'malformed',ms:Date.now()-started});feedback='\nYOUR PREVIOUS ANSWER WAS MALFORMED. Return complete JSON: every corner with its slot, exact title, creator and format, and a real bonus.';continue;}
   await recordRun(model,'error',{...trace,error:e instanceof Error?e.message:'unknown',ms:Date.now()-started});throw providerError(e)}
  const proposal=result.output;
  (trace.attempts as unknown[]).push({attempt,status:proposal.status,ms:Date.now()-started,usage:result.usage});
  if(proposal.status!=='ok'){await recordRun(model,proposal.status,{...trace,ms:Date.now()-started});throw new CornerError(proposal.reason&&proposal.reason.length<=160?proposal.reason:'We couldn’t build a full triangle for that title yet. Try adding its creator.',422)}
  const corners=(proposal.corners||[]).map(c=>({...c,format:formatOf(c.format)||''}));
  if(corners.length!==2||corners.map(c=>c.slot).sort().join()!==[...missing].sort().join()||corners.some(c=>!FORMAT_OF[c.slot as Slot]?.includes(c.format))||!proposal.bonus||!formatOf(proposal.bonus.format)){
   feedback='\nYOUR PREVIOUS ANSWER WAS INCOMPLETE: return exactly two corners, one per missing slot, with the right format (read: book or article; watch: movie, documentary or show; listen: one podcast episode) and one bonus in a supported format.';continue;
  }
  if(proposal.topic)onProgress(`The angle: ${proposal.topic.replace(/\.$/,'')}.`);
  const picks:Pick[]=[...corners.map(c=>({slot:c.slot as Slot,title:c.title,creator:c.creator,format:c.format})),{slot:'bonus',title:proposal.bonus.title,creator:proposal.bonus.creator,format:formatOf(proposal.bonus.format)!}];

  // Find every chosen work in a real catalog while the writer drafts. A work that can't be found is re-picked.
  const writing=new AbortController();
  const writer=generateText({
   model:languageModel(),system,abortSignal:AbortSignal.any([writing.signal,AbortSignal.timeout(75000)]),providerOptions:noThinking,output:Output.object({schema:writerOut}),
   prompt:`Write the finished threeangle as JSON using ONLY the works below. Add no works, facts or links. Structuring must add nothing that was not researched.
CONFIRMED WORK (slot ${slot}): ${JSON.stringify(seedInfo)}
CHOSEN CORNERS: ${JSON.stringify(corners)}
BONUS: ${JSON.stringify(proposal.bonus)}
CHOSEN TOPIC (every work must serve it): ${proposal.topic||''}
EDITORIAL PROPOSAL: ${JSON.stringify({insight:proposal.insight})}
WHAT THE USER LOVED ABOUT IT (the pitch should honour it): ${interest?JSON.stringify(interest):'not stated'}
EDITORIAL VERSION: ${EDITORIAL_VERSION}

Write a smart, approachable, enthusiastic culture-critic pitch. Avoid vague wonder, flowery filler and claims of personal consumption; no unrequested spoilers. The three main works MUST be ordered read, watch, listen, then the bonus as the fourth work. The confirmed work is in slot ${cornerIndex(seed.format)} (zero-based) with its exact title, creator and format. Main pitches 35–50 words; payoff 50–70 words; the bonus pitch 25–40 words; other paragraphs under 35 words; headings under 9 words. Bridges must cover read-watch, watch-listen and listen-read. Exactly three strings in each array and four works. Fields: name (2–7 word topic title), kicker (the chosen topic as a short uppercase label like "TOPIC / FOCUS"), hook (a punchy invitation up to 16 words), intro, heads (read, watch, listen headline), bridges, shift (the insight), payoff (the three-way connection), question, angles (three lenses), answers (one per lens), bonus (a fourth-tangent headline), works.`
  });
  writer.catch(()=>{});
  const found=await Promise.all(picks.map(async p=>{const c=await resolveCorner(p);if(c)onProgress(`Found ${SLOT_NAME[p.slot]}: ${c.title}.`);return c}));
  const lost=picks.filter((_,i)=>!found[i]);
  console.log('build picks',attempt,JSON.stringify(picks.map((p,i)=>({slot:p.slot,title:p.title,creator:p.creator,format:p.format,found:found[i]?.from||null}))));
  (trace.attempts as {found?:unknown}[]).at(-1)!.found=picks.map((p,i)=>({slot:p.slot,title:p.title,from:found[i]?.from||null}));
  if(lost.length){
   writing.abort();
   if(attempt<3){
    rejected=[...rejected,...lost.map(p=>p.title)];
    onProgress(`Couldn’t find ${lost.map(p=>p.title).join(' or ')} in any catalog. Choosing again.`);
    feedback=`\nYOUR PREVIOUS PICKS ${JSON.stringify(lost.map(p=>`${p.title} (${p.creator})`))} COULD NOT BE FOUND in any book, film, podcast or music catalog. Keep what worked and replace only those with real works under their exact published titles.`;
    continue;
   }
   await recordRun(model,'unfound',{...trace,ms:Date.now()-started});
   throw new CornerError('We couldn’t confirm every recommended work in a catalog. Please try again.',422);
  }
  onProgress('Writing the connections.');
  let written;
  try{written=await writer}catch(e){await recordRun(model,'error',{...trace,phase:'write',error:e instanceof Error?e.message:'unknown',ms:Date.now()-started});throw providerError(e)}
  const raw=written.output;
  const clean=(xs:string[],min:number)=>xs.filter(x=>x.length>=min&&!/placeholder|\\"/.test(x)).slice(0,3);
  const out={...raw,heads:clean(raw.heads,12),bridges:clean(raw.bridges,12),angles:clean(raw.angles,2),answers:clean(raw.answers,12),works:raw.works.slice(0,4)};

  // ---------- assemble: identities, links and covers come from the catalogs, not from the writer ----------
  const sources=[...baseSources];
  const add=(c:Candidate)=>{sources.push({title:c.title+' — '+hostOf(c.url),url:c.url});return sources.length-1};
  const bySlot=new Map(picks.map((p,i)=>[p.slot,found[i]!]));
  const identity=(c:Candidate,p:Pick)=>({title:c.title,creator:c.creator||p.creator,format:p.format,source:add(c),...(c.image?{image:c.image}:{})});
  const seedImage=await seedArt;
  const identities=SLOTS.map(s=>s===slot?{title:seed.title,creator:seed.creator,format:seed.format,source:seed.source,...(seedImage?{image:seedImage}:{})}:identity(bySlot.get(s)!,picks.find(p=>p.slot===s)!));
  identities.push(identity(bySlot.get('bonus')!,picks[2]));
  const works=out.works.map((w,i)=>({...w,...identities[i]}));
  await recordRun(model,'ok',{...trace,seedUrl,ms:Date.now()-started,usage:written.usage});
  console.log('build done',Date.now()-started,'ms','cache read',written.usage?.inputTokenDetails?.cacheReadTokens??0);
  return {output:{...out,works},sources};
 }
 await recordRun(model,'incomplete',{...trace,ms:Date.now()-started});
 throw new CornerError('We couldn’t build a full triangle for that title yet. Please try again.',422);
}

// ---------- 3. notable quotes, shown while the triangle is being built ----------
const quotesOut=z.object({quotes:z.array(z.object({text:z.string().min(3).max(240),speaker:z.string().max(120).optional(),url:httpsUrl})).max(3)});
export type Quote={text:string;speaker?:string;url:string};
const wordCount=(s:string)=>s.trim().split(/\s+/).length;
const quoteKey=(s:{title:string;creator:string;format:string})=>[s.format,s.title,s.creator].map(x=>x.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()).join('|');
// The same work never searches twice: verified lines are kept for 90 days, an empty answer for a day.
export async function notableQuotes(seed:{title:string;creator:string;format:string;year?:string}):Promise<Quote[]>{
 const key=quoteKey(seed);
 try{
  const row=await crateDb().prepare('SELECT quotes,created_at FROM quote_cache WHERE work_key=?').bind(key).first<{quotes:string;created_at:number}>();
  if(row){const list=JSON.parse(row.quotes) as Quote[];if(Date.now()-Number(row.created_at)<(list.length?90:1)*86400000)return list;}
 }catch{}
 const quotes=await findQuotes(seed);
 try{await crateDb().prepare('INSERT INTO quote_cache (work_key,quotes,created_at) VALUES (?,?,?) ON CONFLICT(work_key) DO UPDATE SET quotes=excluded.quotes,created_at=excluded.created_at').bind(key,JSON.stringify(quotes),Date.now()).run()}catch{}
 return quotes;
}
async function findQuotes(seed:{title:string;creator:string;format:string;year?:string}):Promise<Quote[]>{
 const model=agentModel(),started=Date.now(),album=seed.format==='Album';
 let result;
 try{
  result=await generateText({
   model:languageModel(),system:EDITORIAL_SYSTEM+'\n\n'+TOOL_RULES,tools:{web_search:search()},stopWhen:isStepCount(4),abortSignal:AbortSignal.timeout(45000),providerOptions:noThinking,
   output:Output.object({schema:quotesOut}),
   prompt:`WORK: ${JSON.stringify(seed)}
Find two or three of the most notable, widely quoted short lines ${album?'ABOUT this album: things the artist said about making it, or a famous critic\'s line about it. NEVER quote song lyrics':'FROM this work: a famous line of text or dialogue, or a memorable line spoken in the episode'}. Search for them, and return only quotes whose exact wording appears in a page you retrieved, with that page's https URL. Each quote at most 25 words, verbatim, no ellipses in the middle. Speaker: the character or person who says it, if known. If you cannot verify any, return an empty list. Never invent or paraphrase a quote.`
  });
 }catch(e){await recordRun(model,'error',{phase:'quotes',title:seed.title,error:e instanceof Error?e.message:'unknown',ms:Date.now()-started});return []}
 const seen=urlsSeen(result.steps);
 const quotes=result.output.quotes.filter(q=>seen.has(normUrl(q.url))&&wordCount(q.text)<=28).map(q=>({text:q.text.trim().replace(/^["“”']+|["“”']+$/g,''),speaker:q.speaker?.trim()||undefined,url:q.url}));
 await recordRun(model,'ok',{phase:'quotes',title:seed.title,returned:result.output.quotes.length,kept:quotes.length,ms:Date.now()-started,usage:result.usage});
 return quotes;
}

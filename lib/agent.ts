import {gateway,generateText,isStepCount,Output,tool} from 'ai';
import {anthropic,createAnthropic} from '@ai-sdk/anthropic';
import {z} from 'zod';
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import corpus from '../editorial/refined-24.json';
import {crateDb} from '@/db/crate';
import {EDITORIAL_SYSTEM,EDITORIAL_VERSION,RESEARCH_BRIEF,calibrationFor} from './editorial';
import {cornerIndex,type Lookup,type Seed,type Source} from './corner-schema';
import {CornerError} from './gemini';

// threeangle's triangle-building agent. Model calls go through Vercel AI Gateway, so the
// model is a config string (AGENT_MODEL). On Vercel the gateway authenticates with OIDC;
// locally set AI_GATEWAY_API_KEY. The Gem's instructions are the system prompt.

const FORMATS=['Book','Article','Movie','Documentary','Show','Podcast episode'] as const;
const SLOTS=['read','watch','listen'] as const;
const anthropicKey=()=>process.env.ANTHROPIC_API_KEY||process.env[Object.keys(process.env).find(k=>/anthropic/i.test(k)&&/key|token/i.test(k))||'']||'';
const direct=()=>Boolean(anthropicKey());
export const agentModel=()=>process.env.AGENT_MODEL||(direct()?'claude-sonnet-5':'anthropic/claude-haiku-4.5');
const languageModel=()=>{console.log('agent model',agentModel(),direct()?'anthropic-direct':'gateway','env names:',Object.keys(process.env).filter(k=>/anthropic|openai|gateway/i.test(k)).join(','));return direct()?createAnthropic({apiKey:anthropicKey()})(agentModel()):agentModel()};
export const isAgentReady=()=>Boolean(process.env.ANTHROPIC_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL);

// ---------- safe page access ----------
type Page={ok:boolean;status:number;url:string;title:string;description:string;text:string;error?:string};
const emptyPage=(url:string,status:number,error:string):Page=>({ok:false,status,url,title:'',description:'',text:'',error});
function privateAddress(ip:string){
if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||a>=224}
const v=ip.toLowerCase();return v==='::1'||v==='::'||v.startsWith('fc')||v.startsWith('fd')||v.startsWith('fe80')||v.startsWith('::ffff:');
}
async function assertPublic(url:URL){
if(url.protocol!=='https:')throw new Error('Only https pages can be opened.');
const host=url.hostname;
if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||isIP(host))throw new Error('That address is not allowed.');
const addresses=await dnsLookup(host,{all:true});
if(!addresses.length||addresses.some(a=>privateAddress(a.address)))throw new Error('That address is not allowed.');
}
async function readCapped(res:Response,limit:number){
if(!res.body)return '';
const reader=res.body.getReader(),decoder=new TextDecoder();let out='';
while(out.length<limit){const {done,value}=await reader.read();if(done)break;out+=decoder.decode(value,{stream:true})}
try{await reader.cancel()}catch{}
return out.slice(0,limit);
}
const decodeEntities=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const metaContent=(html:string,key:string)=>{const m=html.match(new RegExp('<meta[^>]+(?:name|property)=["\']'+key+'["\'][^>]*>','i'));const c=m&&m[0].match(/content=["']([^"']*)["']/i);return c?decodeEntities(c[1]).trim():''};
async function openPage(raw:string,maxChars=4000):Promise<Page>{
let url:URL;
try{url=new URL(raw)}catch{return emptyPage(raw,0,'Invalid URL')}
try{
for(let hop=0;hop<4;hop++){
await assertPublic(url);
const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'user-agent':'Mozilla/5.0 (compatible; threeangle-verifier/1.0)',accept:'text/html,application/xhtml+xml,text/plain'}});
const next=res.headers.get('location');
if(res.status>=300&&res.status<400&&next){url=new URL(next,url);continue}
if(!res.ok)return emptyPage(url.href,res.status,'HTTP '+res.status);
if(!/html|xml|text/i.test(res.headers.get('content-type')||''))return {ok:true,status:res.status,url:url.href,title:'',description:'',text:'',error:'Not a web page'};
const html=await readCapped(res,600000);
const title=decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').trim()||metaContent(html,'og:title');
const description=metaContent(html,'og:description')||metaContent(html,'description');
const text=decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().slice(0,maxChars);
return {ok:true,status:res.status,url:url.href,title,description,text};
}
return emptyPage(url.href,0,'Too many redirects');
}catch(e){return emptyPage(raw,0,e instanceof Error?e.message:'Could not open the page')}
}
const wordsOf=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]+/g)||[];
const STOP=new Set(['the','and','for','with','from','that','this','into','part','episode','season']);
export function titleMatches(title:string,haystack:string){
const need=[...new Set(wordsOf(title).filter(w=>w.length>=3&&!STOP.has(w)))];
if(!need.length)return true;
const have=new Set(wordsOf(haystack));
return need.filter(w=>have.has(w)).length/need.length>=0.6;
}
const normUrl=(u:string)=>{try{const x=new URL(u);return x.hostname.replace(/^www\./,'').toLowerCase()+x.pathname.replace(/\/+$/,'')}catch{return ''}};
const hostOf=(u:string)=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u}};
// Every https URL that appeared in tool results during a run. A recommended link must be one of these.
const urlsSeen=(steps:{content:unknown}[])=>new Set((JSON.stringify(steps.map(s=>s.content))||'').match(/https:\/\/[^\s"'\\<>)\]]+/g)?.map(normUrl).filter(Boolean)||[]);

// ---------- tools ----------
const search=()=>direct()?anthropic.tools.webSearch_20250305({maxUses:3}):gateway.tools.exaSearch({type:'fast',numResults:6,contents:{highlights:true}});
const fetchPage=tool({
description:'Open a public https web page and return its title, description and main text. Use it to confirm the exact title, creator and episode on an official page.',
inputSchema:z.object({url:z.string().url()}),
execute:async({url})=>{const p=await openPage(url,4000);return {ok:p.ok,status:p.status,url:p.url,title:p.title,description:p.description,text:p.text,error:p.error}}
});
const tools=()=>({web_search:search()});
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

// ---------- 1. identify the confirmed work ----------
const lookupOut=z.object({
status:z.enum(['matches','none','clarify']),
question:z.string().max(400).optional(),
matches:z.array(z.object({title:z.string().min(1).max(240),creator:z.string().min(1).max(240),format:z.enum(FORMATS),year:z.string().max(40),description:z.string().min(1).max(1400),url:httpsUrl})).max(3)
});
export async function identifyWork(title:string):Promise<Lookup>{
const model=agentModel(),started=Date.now();
let result;
try{
result=await generateText({
model:languageModel(),system:EDITORIAL_SYSTEM+'\n\n'+TOOL_RULES,tools:tools(),stopWhen:isStepCount(7),abortSignal:AbortSignal.timeout(75000),
output:Output.object({schema:lookupOut}),
prompt:`Identify the work the user means. USER TITLE: ${JSON.stringify(title)}.
Search official publisher, author, filmmaker, distributor or broadcaster pages and return up to three real works that could match, each with exact title, creator, format (${FORMATS.join(' | ')}), year, a factual dossier of at most 1200 characters drawn only from what you found in search (premise, principal cast and crew, tone, setting, what critics say it is really about, their most common comparisons, and the two to four distinct topics or readings the work supports; paraphrase, never quote), and an official https URL you retrieved. For a podcast identify a SPECIFIC episode, never a whole feed: if the user gave only a show or feed, return status "clarify" with one focused question asking which episode. If the title is ambiguous, return the candidates. If the work is an album, song, game or another unsupported format, return status "clarify" and say that new threeangles start from a book, article, movie, documentary, show or podcast episode. If nothing real matches, return status "none" with no matches. Do not guess.`
});
}catch(e){await recordRun(model,'error',{phase:'identify',title,error:e instanceof Error?e.message:'unknown',ms:Date.now()-started});throw providerError(e)}
const out=result.output;
const seen=urlsSeen(result.steps);
const kept=(out.status==='matches'?out.matches:[]).filter(m=>seen.has(normUrl(m.url)));
await recordRun(model,out.status,{phase:'identify',title,tools:toolCounts(result.steps),returned:out.matches.length,kept:kept.length,ms:Date.now()-started,usage:result.usage});
if(out.status==='clarify')throw new CornerError(out.question||'Could you add the creator or a more specific title?',422);
const sources:Source[]=kept.map(m=>({title:m.title+' — '+hostOf(m.url),url:m.url}));
const matches:Seed[]=kept.map((m,i)=>({title:m.title,creator:m.creator,format:m.format,year:m.year,description:m.description,source:i,facts:[]}));
return {id:crypto.randomUUID(),matches,sources,searchHtml:[]};
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

const normFormat=(f:string)=>{const x=f.toLowerCase();return x.includes('podcast')?'Podcast episode':x.includes('documentary')?'Documentary':x.includes('article')||x.includes('essay')||x.includes('reported')?'Article':x.includes('book')||x.includes('novel')||x.includes('memoir')?'Book':x.includes('movie')||x.includes('film')?'Movie':x.includes('series')||x.includes('show')||x.includes('tv')?'Show':''};
const linkFor=(format:string,title:string,creator:string)=>{const q=encodeURIComponent((title+' '+creator).trim());const f=format.toLowerCase();return f.includes('podcast')?'https://podcasts.apple.com/us/search?term='+q:f.includes('book')?'https://openlibrary.org/search?q='+q:f.includes('movie')||f.includes('documentary')||f.includes('show')?'https://www.justwatch.com/us/search?q='+q:'https://www.google.com/search?q='+q};
type Verdict={label:string;title:string;url:string;verdict:'verified'|'provenance-only'|'failed';why:string};
async function verify(items:{label:string;title:string;url:string}[],seen:Set<string>):Promise<Verdict[]>{
return items.map(it=>seen.has(normUrl(it.url))?{...it,verdict:'verified' as const,why:''}:{...it,verdict:'failed' as const,why:'that URL was not in the search results'});
}

export async function buildTriangle(seed:Seed,interest:string,baseSources:Source[],avoid:string[]=[]){
const model=agentModel(),started=Date.now();
const seedUrl=baseSources[seed.source]?.url||'';
const slot=SLOTS[cornerIndex(seed.format)];
const missing=SLOTS.filter(s=>s!==slot);
const references=process.env.AGENT_ALL_REFERENCES==='1'?JSON.stringify(corpus):calibrationFor(seed.title,interest);
const seedInfo={title:seed.title,creator:seed.creator,format:seed.format,year:seed.year,description:seed.description};
const trace:Record<string,unknown>={phase:'build',model,seed:seed.title,attempts:[]};
let feedback='',proposal:z.infer<typeof proposalOut>|undefined,verdicts:Verdict[]=[],attempt=0;
for(attempt=1;attempt<=2;attempt++){
let result;
try{
result=await generateText({
model:languageModel(),system:EDITORIAL_SYSTEM,abortSignal:AbortSignal.timeout(90000),providerOptions:{anthropic:{thinking:{type:'disabled'}}},
output:Output.object({schema:proposalOut}),
prompt:`${RESEARCH_BRIEF}
REFERENCE TRIANGLES (voice and judgment only, not evidence): ${references}

TASK: choose the two missing corners of one finished threeangle.
CONFIRMED WORK (keep exactly): ${JSON.stringify(seedInfo)}
This work was already verified by web search before you were called. Treat these details as established fact even if you do not recognize it (it may be newer than your training data). Never question that it exists and never return needs_more_research because it is unfamiliar; build around its description, creator, format and year.
It occupies the ${slot} slot. Missing slots: ${missing.join(' and ')}. The main slots are read (a book or article), watch (a movie, documentary or show) and listen (ONE specific podcast episode, never a series). Return exactly two corners, one for each missing slot, plus one distinct bonus.
WHAT GRABBED THE USER: ${interest?JSON.stringify(interest):'not stated'}.
${avoid.length?'TRY AGAIN: earlier triangles already used these works: '+JSON.stringify(avoid)+'. Choose a different reading of the confirmed work and entirely different works.\n':''}PROCESS: the confirmed work supports several readings. Choose ONE precise topic that holds the whole triangle together (prefer the reading the user's note points to, otherwise the reading with the strongest three works), state it in the topic field as one sentence, and choose corners that all serve it. Never ask the user to choose. Weigh candidates for each missing slot with the removal, substitution and connection tests, then choose. Choose only real works, and for the podcast only an episode you are certain exists, with its exact title. No links are needed. Prefer one-off episodes from The Daily, 99% Invisible, Radiolab or This American Life, but choose a different show when it contributes much more. No adaptations or sequels of the confirmed work and no repeated works. If a supported set is not possible, set status to needs_more_research or needs_clarification with a short user-facing reason and omit the other fields. Be brief: one sentence per field.${feedback}`
});
}catch(e){await recordRun(model,'error',{...trace,error:e instanceof Error?e.message:'unknown',ms:Date.now()-started});throw providerError(e)}
proposal=result.output;
console.log('agent pick done',Date.now()-started,JSON.stringify(result.usage));
(trace.attempts as unknown[]).push({attempt,status:proposal.status,tools:toolCounts(result.steps),usage:result.usage});
if(proposal.status!=='ok'){await recordRun(model,proposal.status,{...trace,ms:Date.now()-started});throw new CornerError(proposal.reason&&proposal.reason.length<=160?proposal.reason:'We couldn’t build a full triangle for that title yet. Try adding its creator.',422)}
const corners=(proposal.corners||[]).map(c=>({...c,format:normFormat(c.format)}));
const cornerSlots=corners.map(c=>c.slot).sort().join();
const FORMAT_OF:Record<string,string[]>={read:['Book','Article'],watch:['Movie','Documentary','Show'],listen:['Podcast episode']};
if(corners.length!==2||cornerSlots!==[...missing].sort().join()||corners.some(c=>!FORMAT_OF[c.slot].includes(c.format))||!proposal.bonus){feedback='\nYOUR PREVIOUS ANSWER WAS INCOMPLETE: return exactly two corners, one per missing slot, with the right format (read: book or article; watch: movie, documentary or show; listen: one podcast episode) and one bonus.';verdicts=[];continue}
const seen=urlsSeen(result.steps);
verdicts=[...corners.map(c=>({label:c.slot,title:c.title,url:'',verdict:'verified' as const,why:''})),{label:'bonus',title:proposal.bonus.title,url:'',verdict:'verified' as const,why:''}];
break;
}
if(!proposal||proposal.status!=='ok'||!proposal.bonus||verdicts.length===0||verdicts.some(v=>v.verdict==='failed')){
await recordRun(model,'unverified',{...trace,ms:Date.now()-started});
throw new CornerError('We couldn’t verify a source for every recommended work. Please try again or add the creator to your title.',422);
}
const corners=(proposal.corners as z.infer<typeof cornerOut>[]).map(c=>({...c,format:normFormat(c.format)})),bonus=proposal.bonus;

// ---------- writer: no tools, verified works only ----------
let written;
try{
written=await generateText({
model:languageModel(),system:EDITORIAL_SYSTEM,abortSignal:AbortSignal.timeout(60000),providerOptions:{anthropic:{thinking:{type:'disabled'}}},output:Output.object({schema:writerOut}),
prompt:`Write the finished threeangle as JSON using ONLY the verified works below. Add no works, facts or links beyond the evidence notes. Structuring must add nothing that was not researched.
CONFIRMED WORK (slot ${slot}): ${JSON.stringify(seedInfo)}
VERIFIED CORNERS: ${JSON.stringify(corners)}
BONUS: ${JSON.stringify(bonus)}
CHOSEN TOPIC (every work must serve it): ${proposal.topic||''}
EDITORIAL PROPOSAL: ${JSON.stringify({insight:proposal.insight})}
WHAT GRABBED THE USER: ${interest?JSON.stringify(interest):'not stated'}
EDITORIAL VERSION: ${EDITORIAL_VERSION}
REFERENCE TRIANGLES (voice only, never copy works or claims): ${references}

Write a smart, approachable, enthusiastic culture-critic pitch. Avoid vague wonder, flowery filler and claims of personal consumption; no unrequested spoilers. The three main works MUST be ordered read, watch, listen, then the bonus as the fourth work. The confirmed work is in slot ${cornerIndex(seed.format)} (zero-based) with its exact title, creator and format. Main pitches 35–50 words; payoff 50–70 words; the bonus pitch 25–40 words; other paragraphs under 35 words; headings under 9 words. Bridges must cover read-watch, watch-listen and listen-read. Exactly three strings in each array and four works. Fields: name (2–7 word topic title), kicker (the chosen topic as a short uppercase label like "TOPIC / FOCUS"), hook (a punchy invitation up to 16 words), intro, heads (read, watch, listen headline), bridges, shift (the insight), payoff (the three-way connection), question, angles (three lenses), answers (one per lens), bonus (a fourth-tangent headline), works.`
});
}catch(e){await recordRun(model,'error',{...trace,phase:'write',error:e instanceof Error?e.message:'unknown',ms:Date.now()-started});throw providerError(e)}
const raw=written.output;
const clean=(xs:string[],min:number)=>xs.filter(x=>x.length>=min&&!/placeholder|\\"/.test(x)).slice(0,3);
const out={...raw,heads:clean(raw.heads,12),bridges:clean(raw.bridges,12),angles:clean(raw.angles,2),answers:clean(raw.answers,12),works:raw.works.slice(0,4)};
console.log('agent write done',Date.now()-started,JSON.stringify(written.usage));

// ---------- assemble: identities and links come from verified data, not from the writer ----------
const sources=[...baseSources];
const add=(title:string,url:string)=>{sources.push({title:title+' — '+hostOf(url),url});return sources.length-1};
const bySlot=Object.fromEntries(corners.map(c=>[c.slot,c]));
const identities:{title:string;creator:string;format:string;source:number}[]=SLOTS.map(s=>s===slot?{title:seed.title,creator:seed.creator,format:seed.format,source:seed.source}:{title:bySlot[s].title,creator:bySlot[s].creator,format:bySlot[s].format,source:add(bySlot[s].title,linkFor(bySlot[s].format,bySlot[s].title,bySlot[s].creator))});
identities.push({title:bonus.title,creator:bonus.creator,format:bonus.format,source:add(bonus.title,linkFor(bonus.format,bonus.title,bonus.creator))});
const works=out.works.map((w,i)=>({...w,...identities[i]}));
await recordRun(model,'ok',{...trace,seedUrl,verdicts:verdicts.map(v=>({label:v.label,verdict:v.verdict})),ms:Date.now()-started,usage:written.usage});
return {output:{...out,works},sources};
}

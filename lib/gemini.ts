import {EDITORIAL_SYSTEM} from './editorial';
import {crateDb} from '@/db/crate';
import type {Source} from './corner-schema';
const settings=()=>process.env;
export const isGeminiReady=()=>Boolean(settings().GEMINI_API_KEY);
export class CornerError extends Error{constructor(message:string,public status=503){super(message)}}
const system=EDITORIAL_SYSTEM;
export async function gemini(prompt:string,search:boolean,maxOutputTokens=7000,retried=false){
 const config=settings();if(!config.GEMINI_API_KEY)throw new CornerError('Custom triangles are not available yet. You can still explore the curated topics.');
 const model=config.GEMINI_MODEL||'gemini-2.5-flash';
 const callId=crypto.randomUUID();
 await crateDb().prepare('INSERT INTO generation_call (id,model,created_at,status) VALUES (?,?,?,?)').bind(callId,model,Date.now(),'pending').run();
 const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':config.GEMINI_API_KEY},signal:AbortSignal.timeout(100000),body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],...(search?{tools:[{google_search:{}}]}:{}),generationConfig:{temperature:search?.35:.5,maxOutputTokens,...(model==='gemini-2.5-flash'?{thinkingConfig:{thinkingBudget:search?1024:0}}:{}),...(!search?{responseMimeType:'application/json'}:{})}})});
 if(!r.ok){console.error('Gemini request status',r.status);throw new CornerError(r.status===429?'The research service is busy. Please try again in a little while.':'The research service could not finish. Please try again later.');}
 const payload=await r.json();
 await crateDb().prepare('UPDATE generation_call SET response=?,status=? WHERE id=?').bind(JSON.stringify(payload),'complete',callId).run();
 const data=payload as {candidates?:{finishReason?:string;content?:{parts?:{text?:string;thought?:boolean}[]};groundingMetadata?:{groundingChunks?:{web?:{uri?:string;title?:string}}[];searchEntryPoint?:{renderedContent?:string}}}[]};
 const c=data.candidates?.[0];const text=c?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('')||'';
 if(!text||c?.finishReason!=='STOP')throw new CornerError('We couldn’t complete reliable research for that title. Try adding its creator or a more specific title.');
 const sources:Source[]=[];for(const chunk of c.groundingMetadata?.groundingChunks||[]){const w=chunk.web;if(w?.uri?.startsWith('https://')&&!sources.some(s=>s.url===w.uri))sources.push({title:w.title||'Research source',url:w.uri});}
 if(search&&!sources.length)console.error('Gemini returned no grounding sources',JSON.stringify({retried,finishReason:c?.finishReason,hasGrounding:Boolean(c?.groundingMetadata),searchQueries:((c?.groundingMetadata as {webSearchQueries?:string[]}|undefined)?.webSearchQueries||[]).length,chunks:(c?.groundingMetadata?.groundingChunks||[]).length,textLength:text.length,head:text.slice(0,200)}));
if(search&&!sources.length){if(!retried)return gemini(prompt+'\n\nYou must run Google Search now and base every title, creator and claim on the search results. Do not answer from memory.',search,maxOutputTokens,true);throw new CornerError('We couldn’t find enough source material. Try adding the author, director, or podcast host.');}
 return {text,sources,html:c.groundingMetadata?.searchEntryPoint?.renderedContent||''};
}
export function parseJson(text:string):unknown{try{return JSON.parse((()=>{const t=text.trim();const a=t.indexOf('{'),b=t.lastIndexOf('}');return a>=0&&b>a?t.slice(a,b+1):t})())}catch{throw new CornerError('The research arrived incomplete. Please try again.')}}

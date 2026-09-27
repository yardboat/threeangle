import base from './catalog-base.json';
import extras from './extra-topics.json';
import {resolveWork} from './catalog';

// Covers (and a canonical link where a work has none) for the curated topics, resolved once and committed
// to the JSON so the reveal never looks them up again. Editorial links already in the data are kept.
export type Fill={file:'catalog-base'|'extra-topics';topic:string;index:number;title:string;image?:string;url?:string};
export async function curatedFills():Promise<Fill[]>{
 const jobs=[...base.map(t=>({file:'catalog-base' as const,t})),...extras.map(t=>({file:'extra-topics' as const,t}))]
  .flatMap(({file,t})=>(t.works as {title:string;creator:string;format:string;url?:string;image?:string}[]).map((w,index)=>({file,topic:t.id,index,w})))
  .filter(j=>!j.w.image);
 const out:Fill[]=[];
 for(let i=0;i<jobs.length;i+=8)out.push(...await Promise.all(jobs.slice(i,i+8).map(async j=>{
  const found=await resolveWork({title:j.w.title,creator:j.w.creator,format:j.w.format,url:j.w.url}).catch(()=>null);
  return {file:j.file,topic:j.topic,index:j.index,title:j.w.title,...(found?.image?{image:found.image}:{}),...(!j.w.url&&found?.url?{url:found.url}:{})};
 })));
 return out;
}

import type {Topic} from './stories';

// Both cached JSON and fresh NDJSON are returned by the existing corner endpoint.
export async function readTriangleResponse(response:Response,onStatus:(text:string)=>void):Promise<Topic>{
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'The library couldn’t finish this connection. Please try again.');}
 if(response.headers.get('content-type')?.includes('application/json')){
  const data=await response.json();return requireTopic(data.topic);
 }
 const reader=response.body?.getReader();if(!reader)throw new Error('The connection was interrupted. Your starting title is still here.');
 const decoder=new TextDecoder();let buffer='';
 function event(line:string):Topic|undefined{
  if(!line.trim())return;
  const data=JSON.parse(line);
  if(data.type==='error')throw new Error(data.error||'We couldn’t complete this triangle. Please try again.');
  if(data.type==='status'&&typeof data.text==='string')onStatus(data.text);
  if(data.type==='result')return requireTopic(data.topic);
 }
 try{
  while(true){
   const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
   const lines=buffer.split('\n');buffer=lines.pop()||'';
   for(const line of lines){const topic=event(line);if(topic)return topic;}
   if(done){const topic=event(buffer);if(topic)return topic;break;}
  }
  throw new Error('The connection was interrupted. Try again to recover your triangle.');
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function requireTopic(value:unknown):Topic{
 const t=value as Topic;
 if(!t||typeof t.id!=='string'||typeof t.name!=='string'||!Array.isArray(t.works)||t.works.length<3||t.works.some(w=>!w||typeof w.title!=='string'||typeof w.creator!=='string'))throw new Error('This connection arrived incomplete. Please try again.');
 return t;
}
export const sameWork=(a:{title:string;creator:string;format:string},b:{title:string;creator:string;format:string})=>
 a.title.trim().toLocaleLowerCase()===b.title.trim().toLocaleLowerCase()&&a.creator.trim().toLocaleLowerCase()===b.creator.trim().toLocaleLowerCase()&&a.format===b.format;

// ---- In-app navigation -------------------------------------------------------------
// Every screen the visitor can be on. Each one that matters is a real browser history entry,
// so the browser's Back button and the in-page Back button walk the same path.
export type Screen={s:'welcome'}|{s:'find'}|{s:'confirm';c:number}|{s:'thinking'}|{s:'reveal';id:string};
export const screenUrl=(screen:Screen)=>screen.s==='reveal'?'/v2?triangle='+encodeURIComponent(screen.id):screen.s==='welcome'?'/v2':'/v2?start=title';
export function screenFromSearch(search:string):Screen{
 const params=new URLSearchParams(search),id=params.get('triangle');
 return id?{s:'reveal',id}:params.get('start')==='title'?{s:'find'}:{s:'welcome'};
}
export const sameScreen=(a:Screen,b:Screen)=>a.s===b.s&&(a.s!=='confirm'||a.c===(b as {c:number}).c)&&(a.s!=='reveal'||a.id===(b as {id:string}).id);
// Where "Back" goes when there is no earlier in-app entry (a shared link, a reload).
export const parentScreen=(screen:Screen):Screen=>screen.s==='confirm'?{s:'find'}:screen.s==='thinking'?{s:'find'}:{s:'welcome'};

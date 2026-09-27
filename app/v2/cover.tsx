'use client';
import {useEffect,useState} from 'react';
import {imgSrc} from '@/lib/images';

// A work's cover art. Works carry it (`image`, found in a catalog when the work was found); older works fall
// back to one /api/art lookup per page load. Until it arrives (or when there is none) the card is
// typographic: format, title and creator set like a book plate, so a missing cover still looks intended.
export type CoverWork={title:string;creator:string;format:string;url?:string;image?:string|null};
const cache=new Map<string,Promise<string|null>>();
export function coverUrl(w:CoverWork){
 if(w.image)return Promise.resolve(imgSrc(w.image));
 const key=[w.title,w.creator,w.format].join('|').toLowerCase();
 if(!cache.has(key)){
  const q=new URLSearchParams({t:w.title,c:w.creator,f:w.format});if(w.url?.startsWith('https://'))q.set('u',w.url);
  cache.set(key,fetch('/api/art?'+q).then(r=>r.ok?r.json():{url:null}).then(d=>typeof d.url==='string'?imgSrc(d.url):null).catch(()=>null));
 }
 return cache.get(key)!;
}
const shape=(format:string)=>{const f=format.toLowerCase();return f.includes('podcast')||f.includes('album')?'square':f.includes('movie')||f.includes('documentary')||f.includes('show')?'poster':f.includes('article')?'wide':'book';};

export function Cover({work,size='m',className=''}:{work:CoverWork;size?:'xs'|'s'|'m'|'l';className?:string}){
 const key=[work.title,work.creator,work.format,work.image||''].join('|');
 const [got,setGot]=useState<{key:string;src:string|null;loaded:boolean}>(()=>({key,src:work.image?imgSrc(work.image):null,loaded:false}));
 useEffect(()=>{let live=true;void coverUrl(work).then(u=>{if(live)setGot(g=>g.key===key&&g.src===u?g:{key,src:u,loaded:false});});return()=>{live=false;};},[key]); // eslint-disable-line react-hooks/exhaustive-deps
 const src=got.key===key?got.src:null,loaded=got.key===key&&got.loaded;
 return <figure className={`wk-cover wk-cover-${shape(work.format)} wk-cover-${size} ${loaded?'is-loaded':''} ${className}`}>
  <div className="wk-cover-plate" aria-hidden={Boolean(src&&loaded)}><span className="wk-cover-format">{work.format}</span>{size!=='xs'&&<><span className="wk-cover-title">{work.title}</span><span className="wk-cover-by">{work.creator}</span></>}</div>
  {/* eslint-disable-next-line @next/next/no-img-element -- covers come from several catalogs through /api/img */}
  {src&&<img src={src} alt={`Cover of ${work.title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={()=>setGot(g=>({...g,loaded:true}))} onError={()=>setGot(g=>({...g,src:null}))}/>}
 </figure>;
}

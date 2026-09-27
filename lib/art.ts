import {openPage} from './page';

// Cover art for a work: book covers from Open Library, everything else from the iTunes Search API
// (films, TV seasons, podcast episodes, albums), and the page's own share image for an article.
// No keys needed. Each lookup is a best guess checked against the title, so a wrong cover is rarer
// than a missing one; a missing cover falls back to a typographic card in the interface.

export type ArtQuery={title:string;creator:string;format:string;url?:string};
type Hit={title:string;creator:string;image:string};

const words=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/&/g,' and ').match(/[a-z0-9]+/g)||[];
const STOP=new Set(['the','a','an','of','and','season','episode','ep','part','vol','volume']);
// Share of the wanted title's words that appear in the candidate's title.
export function overlap(want:string,have:string){
 const need=[...new Set(words(want).filter(w=>!STOP.has(w)))];if(!need.length)return 1;
 const got=new Set(words(have));return need.filter(w=>got.has(w)).length/need.length;
}
export function pick(q:ArtQuery,hits:Hit[]):string|null{
 let best:{score:number;image:string}|null=null;
 for(const h of hits){
  if(!h.image)continue;
  const t=overlap(q.title,h.title);if(t<.6)continue;
  // A different creator means a different work with the same name (Damnation by Béla Tarr is not DamNation).
  const c=q.creator&&h.creator?Math.max(overlap(q.creator,h.creator),overlap(h.creator,q.creator)):.5;if(c===0)continue;
  // Prefer the exact title over a longer one that contains it (Red Rising over Red Rising: Sons of Ares).
  const score=t*2+overlap(h.title,q.title)+c;
  if(!best||score>best.score)best={score,image:h.image};
 }
 return best?.image||null;
}

async function json(url:string){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(6000),headers:{'user-agent':'threeangle/1.0 (cover art)',accept:'application/json'}});return r.ok?await r.json():null;}catch{return null;}
}
// iTunes artwork comes as 100x100; the same path serves larger sizes.
export const bigArt=(u:string)=>u.replace(/\/(\d+)x(\d+)(bb|cc|sr)?\.(jpg|jpeg|png|webp)$/i,'/600x600bb.jpg');
type ITunes={trackName?:string;collectionName?:string;artistName?:string;collectionArtistName?:string;artworkUrl600?:string;artworkUrl100?:string};
async function itunes(term:string,entity:string,media?:string):Promise<ITunes[]>{
 const u=`https://itunes.apple.com/search?term=${encodeURIComponent(term.slice(0,200))}&entity=${entity}${media?'&media='+media:''}&limit=8&country=us`;
 const d=await json(u);return Array.isArray(d?.results)?d.results:[];
}
const art=(r:ITunes)=>bigArt(r.artworkUrl600||r.artworkUrl100||'');

async function book(q:ArtQuery){
 const d=await json(`https://openlibrary.org/search.json?title=${encodeURIComponent(q.title)}${q.creator?'&author='+encodeURIComponent(q.creator):''}&limit=6&fields=title,author_name,cover_i`);
 const hits:Hit[]=(d?.docs||[]).filter((x:{cover_i?:number})=>x.cover_i).map((x:{title:string;author_name?:string[];cover_i:number})=>({title:x.title,creator:(x.author_name||[]).join(' '),image:`https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg`}));
 return pick(q,hits)||pick(q,(await itunes(q.title+' '+q.creator,'ebook')).map(r=>({title:r.trackName||'',creator:r.artistName||'',image:art(r)})));
}
async function film(q:ArtQuery){
 return pick(q,(await itunes(q.title,'movie')).map(r=>({title:r.trackName||'',creator:r.artistName||'',image:art(r)})))
  ||pick(q,(await itunes(q.title,'tvSeason')).map(r=>({title:r.collectionName||'',creator:r.artistName||'',image:art(r)})));
}
async function show(q:ArtQuery){
 return pick(q,(await itunes(q.title,'tvSeason')).map(r=>({title:r.collectionName||'',creator:r.artistName||'',image:art(r)})))
  ||pick(q,(await itunes(q.title,'movie')).map(r=>({title:r.trackName||'',creator:r.artistName||'',image:art(r)})));
}
async function podcast(q:ArtQuery){
 // An episode carries its own art when it has any; otherwise the show's.
 const ep=pick(q,(await itunes(q.title+' '+q.creator,'podcastEpisode','podcast')).map(r=>({title:r.trackName||'',creator:r.collectionName||r.artistName||'',image:art(r)})));
 if(ep)return ep;
 const shows=await itunes(q.creator||q.title,'podcast','podcast');
 return pick({...q,title:q.creator||q.title,creator:''},shows.map(r=>({title:r.collectionName||r.trackName||'',creator:r.artistName||'',image:art(r)})));
}
async function album(q:ArtQuery){
 return pick(q,(await itunes(q.title+' '+q.creator,'album','music')).map(r=>({title:r.collectionName||'',creator:r.artistName||'',image:art(r)})));
}
const SEARCH_HOSTS=/(^|\.)(google|bing|duckduckgo|openlibrary|justwatch|apple)\.[a-z.]+$/i;
async function article(q:ArtQuery){
 if(!q.url)return null;
 try{if(SEARCH_HOSTS.test(new URL(q.url).hostname))return null;}catch{return null;}
 const p=await openPage(q.url,200);return p.ok&&p.image?.startsWith('https://')?p.image:null;
}

export async function findArt(q:ArtQuery):Promise<string|null>{
 const f=q.format.toLowerCase();
 if(f.includes('book'))return book(q);
 if(f.includes('podcast'))return podcast(q);
 if(f.includes('album'))return album(q);
 if(f.includes('show')||f.includes('series'))return show(q);
 if(f.includes('movie')||f.includes('film')||f.includes('documentary'))return film(q);
 if(f.includes('article'))return article(q);
 return null;
}

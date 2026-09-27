import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {FORMATS,type Format} from './formats';
import {openPage,assertPublic} from './page';

// Real catalogs, searched directly: the fast path for finding a work, its cover and its canonical page.
//   Books: Open Library, Google Books.  Films, documentaries, TV: TMDB (with TMDB_API_KEY), else the iTunes
//   Search API.  Podcast episodes: iTunes, then the show's own RSS feed, then Podcast Index (with keys).
//   Albums: iTunes, then MusicBrainz.  Wikipedia fills gaps for every format; articles come from a URL.
// Every lookup is checked against the wanted title and creator, so a wrong cover is rarer than a missing one.

export type Candidate={title:string;creator:string;format:Format;year:string;description:string;url:string;image?:string;from:string;alt?:string[];score?:number};
export type WorkQuery={title:string;creator?:string;format:string;url?:string};

const UA='threeangle/1.0 (https://threeangle.vercel.app; catalog lookup)';
const DAY=86400000;

// ---------- fetching, with a small in-memory cache per server instance ----------
const memo=new Map<string,{at:number;value:Promise<unknown>}>();
async function getJson<T>(url:string,{timeout=4000,headers={} as Record<string,string>}={}):Promise<T|null>{
 const hit=memo.get(url);if(hit&&Date.now()-hit.at<DAY)return hit.value as Promise<T|null>;
 const value=(async()=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{'user-agent':UA,accept:'application/json',...headers}});return r.ok?await r.json() as T:null}catch{return null}})();
 memo.set(url,{at:Date.now(),value});if(memo.size>3000)memo.delete(memo.keys().next().value!);
 void value.then(v=>{if(v===null)memo.delete(url)});
 return value;
}

// ---------- matching ----------
const fold=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ');
const words=(s:string)=>fold(s).match(/[a-z0-9]+/g)||[];
const STOP=new Set(['the','a','an','of','and','season','episode','ep','part','vol','volume']);
// Share of the wanted string's words that appear in the other.
export function overlap(want:string,have:string){
 const need=[...new Set(words(want).filter(w=>!STOP.has(w)))];if(!need.length)return words(want).length?Number(words(have).join(' ')===words(want).join(' ')):1;
 const got=new Set(words(have));return need.filter(w=>got.has(w)).length/need.length;
}
// "Severance, Season 1" -> "Severance"; "Jaws (1975 film)" -> "Jaws"; "Rumours (Deluxe)" -> "Rumours".
const bare=(t:string)=>t.replace(/\s*[,:(–—-]\s*(season|series|volume|vol\.?)\s*\d+[^]*$/i,'').replace(/\s*\((?:\d{4} )?(?:[a-z ]*?)(film|movie|tv series|miniseries|novel|book|album|documentary|podcast|remaster(?:ed)?|deluxe[^)]*|expanded[^)]*|anniversary[^)]*)\)\s*$/i,'').replace(/\s+-\s+(single|ep)$/i,'').trim();
// How well a catalog title fits the wanted one, both ways, so "Surviving Jaws" is not "Jaws".
export function titleFit(want:string,have:string){
 let h=bare(have);const w=bare(want);
 if(!/[:–—]/.test(w))h=h.split(/\s*[:–—]\s+/)[0];
 return Math.min(overlap(w,h),overlap(h,w));
}
// A different creator means a different work with the same name (Damnation by Béla Tarr is not DamNation).
export function creatorFits(want:string|undefined,c:Candidate){
 if(!want?.trim()||(!c.creator&&!c.alt?.length))return true;
 return [c.creator,...(c.alt||[])].filter(Boolean).some(have=>overlap(want,have)>0||overlap(have,want)>0);
}
const fits=(q:WorkQuery,c:Candidate,min=.75)=>titleFit(q.title,c.title)>=min&&creatorFits(q.creator,c);

const yearOf=(s?:string)=>(s||'').match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]||'';
const clip=(s:string,n=700)=>{const t=s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1).replace(/\s+\S*$/,'')+'…':t};
const https=(u?:string)=>u?u.replace(/^http:\/\//,'https://'):undefined;
export const formatOf=(f:string):Format|null=>{const x=f.toLowerCase();
 if(/album|record/.test(x))return 'Album';if(x.includes('podcast'))return 'Podcast episode';
 if(/\b(tv|television)\b|series|show|miniseries/.test(x))return 'Show';if(x.includes('documentary'))return 'Documentary';
 if(/book|novel|memoir|collection|oral history|biography|nonfiction|non-fiction/.test(x))return 'Book';
 if(/article|essay|story|feature|reporting/.test(x))return 'Article';if(/movie|film/.test(x))return 'Movie';return null};
const screen=(f:Format)=>f==='Movie'||f==='Documentary'?'film':f;

// ---------- Open Library ----------
type OLDoc={key:string;title:string;subtitle?:string;author_name?:string[];first_publish_year?:number;cover_i?:number;edition_count?:number};
async function openLibrary(params:Record<string,string>,timeout=3000):Promise<Candidate[]>{
 const d=await getJson<{docs?:OLDoc[]}>('https://openlibrary.org/search.json?'+new URLSearchParams({...params,limit:'8',fields:'key,title,subtitle,author_name,first_publish_year,cover_i,edition_count'}),{timeout});
 return (d?.docs||[]).map(x=>({title:x.title,creator:(x.author_name||[]).slice(0,2).join(' and '),alt:x.author_name,format:'Book' as const,year:x.first_publish_year?String(x.first_publish_year):'',description:'',url:'https://openlibrary.org'+x.key,image:x.cover_i?`https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg`:undefined,from:'openlibrary',score:Math.min(1,Math.log10((x.edition_count||1)+1)/2)}));
}
async function openLibraryDescription(url:string){
 const d=await getJson<{description?:string|{value?:string}}>(url+'.json',{timeout:2500});
 const v=typeof d?.description==='string'?d.description:d?.description?.value;return v?clip(v.replace(/\(\[source\][^)]*\)|-{3,}[^]*$/g,''),900):'';
}

// ---------- Google Books ----------
type GBItem={id:string;volumeInfo:{title:string;subtitle?:string;authors?:string[];publishedDate?:string;description?:string;imageLinks?:{thumbnail?:string};canonicalVolumeLink?:string;infoLink?:string;ratingsCount?:number;language?:string}};
async function googleBooks(q:string,timeout=3000):Promise<Candidate[]>{
 const key=process.env.GOOGLE_BOOKS_API_KEY;
 const d=await getJson<{items?:GBItem[]}>('https://www.googleapis.com/books/v1/volumes?'+new URLSearchParams({q,maxResults:'8',printType:'books',...(key?{key}:{})}),{timeout});
 return (d?.items||[]).filter(x=>!x.volumeInfo.language||x.volumeInfo.language==='en').map(x=>{const v=x.volumeInfo;return {title:v.title,creator:(v.authors||[]).slice(0,2).join(' and '),alt:v.authors,format:'Book' as const,year:yearOf(v.publishedDate),description:clip(v.description||''),url:https(v.canonicalVolumeLink||v.infoLink)||`https://books.google.com/books?id=${x.id}`,image:v.imageLinks?.thumbnail?https(v.imageLinks.thumbnail)!.replace('&edge=curl',''):undefined,from:'googlebooks',score:Math.min(1,Math.log10((v.ratingsCount||0)+1)/3)}});
}

// ---------- TMDB ----------
const tmdbKey=()=>(process.env.TMDB_KEY||process.env.TMDB_API_KEY||process.env.TMDB_READ_TOKEN||'').trim();
export const hasTmdb=()=>Boolean(tmdbKey());
function tmdb<T>(path:string,params:Record<string,string>={},timeout=2500){
 const k=tmdbKey(),bearer=k.startsWith('eyJ'),q=new URLSearchParams({language:'en-US',...params,...(bearer?{}:{api_key:k})});
 return getJson<T>(`https://api.themoviedb.org/3${path}?${q}`,{timeout,headers:bearer?{authorization:'Bearer '+k}:{}});
}
type TmdbHit={id:number;media_type?:string;title?:string;name?:string;release_date?:string;first_air_date?:string;overview?:string;poster_path?:string|null;genre_ids?:number[];popularity?:number};
type TmdbDetail={credits?:{crew?:{job:string;name:string}[]};created_by?:{name:string}[];networks?:{name:string}[];production_companies?:{name:string}[];genres?:{id:number}[]};
async function tmdbCandidate(h:TmdbHit,kind:'movie'|'tv'):Promise<Candidate>{
 const d=await tmdb<TmdbDetail>(`/${kind}/${h.id}`,kind==='movie'?{append_to_response:'credits'}:{},2000);
 const directors=(d?.credits?.crew||[]).filter(c=>c.job==='Director').map(c=>c.name),made=(d?.created_by||[]).map(c=>c.name);
 const docu=(h.genre_ids||d?.genres?.map(g=>g.id)||[]).includes(99);
 const creator=(kind==='movie'?directors:made).slice(0,2).join(' and ')||(d?.networks?.[0]?.name||'');
 return {title:(kind==='movie'?h.title:h.name)||'',creator,alt:[...directors,...made,...(d?.networks||[]).map(n=>n.name),...(d?.production_companies||[]).slice(0,3).map(n=>n.name)],format:kind==='tv'?'Show':docu?'Documentary':'Movie',year:yearOf(kind==='movie'?h.release_date:h.first_air_date),description:clip(h.overview||''),url:`https://www.themoviedb.org/${kind}/${h.id}`,image:h.poster_path?`https://image.tmdb.org/t/p/w500${h.poster_path}`:undefined,from:'tmdb',score:Math.min(1,Math.log10((h.popularity||0)+1)/2)};
}
async function tmdbSearch(q:string,kind?:'movie'|'tv',timeout=2500):Promise<Candidate[]>{
 if(!hasTmdb())return [];
 const d=await tmdb<{results?:TmdbHit[]}>(kind?`/search/${kind}`:'/search/multi',{query:q,include_adult:'false'},timeout);
 const hits=(d?.results||[]).map(h=>({...h,media_type:h.media_type||kind})).filter(h=>h.media_type==='movie'||h.media_type==='tv').slice(0,6);
 return Promise.all(hits.map(h=>tmdbCandidate(h,h.media_type as 'movie'|'tv')));
}

// ---------- iTunes Search API ----------
type It={trackId?:number;collectionId?:number;trackName?:string;collectionName?:string;artistName?:string;releaseDate?:string;description?:string;shortDescription?:string;longDescription?:string;trackViewUrl?:string;collectionViewUrl?:string;artworkUrl600?:string;artworkUrl100?:string;primaryGenreName?:string;feedUrl?:string;collectionType?:string};
export const bigArt=(u:string)=>u.replace(/\/(\d+)x(\d+)(bb|cc|sr)?\.(jpg|jpeg|png|webp)$/i,'/600x600bb.jpg');
async function itunes(term:string,entity:string,media?:string,timeout=3000,limit=8):Promise<It[]>{
 const d=await getJson<{results?:It[]}>('https://itunes.apple.com/search?'+new URLSearchParams({term:term.slice(0,200),entity,...(media?{media}:{}),limit:String(limit),country:'us'}),{timeout});
 return Array.isArray(d?.results)?d.results:[];
}
const art=(r:It)=>{const u=r.artworkUrl600||r.artworkUrl100;return u?bigArt(u):undefined};
async function itunesEpisodes(term:string,timeout=3000):Promise<Candidate[]>{
 return (await itunes(term,'podcastEpisode','podcast',timeout,10)).filter(r=>r.trackName).map((r,i)=>({title:r.trackName!,creator:r.collectionName||r.artistName||'',alt:[r.artistName||''],format:'Podcast episode' as const,year:yearOf(r.releaseDate),description:clip(r.description||r.shortDescription||''),url:https(r.trackViewUrl)||'',image:art(r),from:'itunes',score:.3-i*.02}));
}
async function itunesAlbums(term:string,timeout=3000):Promise<Candidate[]>{
 return (await itunes(term,'album','music',timeout,8)).filter(r=>r.collectionName&&!/ - (single|ep)$/i.test(r.collectionName)).map((r,i)=>({title:r.collectionName!.replace(/ - (single|ep)$/i,''),creator:r.artistName||'',format:'Album' as const,year:yearOf(r.releaseDate),description:r.primaryGenreName?`A ${r.primaryGenreName.toLowerCase()} album by ${r.artistName}${yearOf(r.releaseDate)?`, released in ${yearOf(r.releaseDate)}`:''}.`:'',url:https(r.collectionViewUrl)||'',image:art(r),from:'itunes',score:.3-i*.02}));
}
async function itunesScreen(term:string,kind:'movie'|'tv',timeout=3000):Promise<Candidate[]>{
 const rows=await itunes(term,kind==='movie'?'movie':'tvSeason',undefined,timeout,8);
 return rows.map((r,i)=>({title:bare((kind==='movie'?r.trackName:r.collectionName)||''),creator:r.artistName||'',format:kind==='tv'?'Show' as const:/documentary/i.test(r.primaryGenreName||'')?'Documentary' as const:'Movie' as const,year:yearOf(r.releaseDate),description:clip(r.longDescription||r.description||r.shortDescription||''),url:https(kind==='movie'?r.trackViewUrl:r.collectionViewUrl)||'',image:art(r),from:'itunes',score:.2-i*.02})).filter(c=>c.title&&c.url);
}

// ---------- Wikipedia (every format; film and TV posters when TMDB is not configured) ----------
type WikiPage={pageid:number;index?:number;title:string;description?:string;extract?:string;thumbnail?:{source:string};fullurl?:string};
export function wikiFormat(description:string,extract=''):Format|null{
 const d=description.toLowerCase(),e=extract.slice(0,300).toLowerCase();
 if(/\b(song|single|singer|musician|band|actor|actress|writer|novelist|director|journalist|politician|character|video game|franchise)\b/.test(d)&&!/\b(album|film|series|novel|book)\b/.test(d))return null;
 if(/documentary/.test(d)&&/\b(film|movie)\b/.test(d))return 'Documentary';
 if(/\b(film|movie)\b/.test(d)&&!/series/.test(d))return 'Movie';
 if(/\b(television|tv|web|streaming|anime|animated|reality|talk|game|drama|comedy)\b.*\b(series|show|miniseries|sitcom|serial)\b|\bminiseries\b|\bsitcom\b|\bdocuseries\b/.test(d))return 'Show';
 if(/\balbum\b/.test(d))return 'Album';
 if(/\b(novel|book|memoir|non-?fiction|biography|novella|autobiography|short story collection|poetry collection|essay collection|graphic novel|treatise|children's book)\b/.test(d))return 'Book';
 if(!d&&/\bis a (\d{4} )?(american |british )?(novel|book)\b/.test(e))return 'Book';
 return null;
}
const creatorFrom=(description:string,extract:string)=>{
 const m=description.match(/\bby ([^,;(]+?)\s*(?:\(|,|;|$)/)||extract.match(/\b(?:directed|created|written|hosted|recorded) by ([A-Z][^,.;()]{2,60}?)(?:,| and |\.|;| \(| for | from | that | which )/)||extract.match(/\bby (?:the )?(?:American |English |British |Canadian |Australian |Irish )?(?:[a-z]+ )?([A-Z][\w.'’-]+(?: [A-Z][\w.'’-]+){0,3})/);
 return m?m[1].replace(/^(the )?(american|english|british|canadian|australian|irish)\s+(\w+\s+)?/i,'').trim():'';
};
async function wikipedia(query:string,limit=6,timeout=2500):Promise<(Candidate&{page:string})[]>{
 const d=await getJson<{query?:{pages?:WikiPage[]}}>('https://en.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',gsrsearch:query,gsrlimit:String(limit),gsrnamespace:'0',prop:'pageimages|description|extracts|info',piprop:'thumbnail',pithumbsize:'600',pilicense:'any',exintro:'1',explaintext:'1',exsentences:'4',exlimit:'max',inprop:'url',redirects:'1'}),{timeout});
 const pages=(d?.query?.pages||[]).sort((a,b)=>(a.index||0)-(b.index||0));
 const out:(Candidate&{page:string})[]=[];
 pages.forEach((p,i)=>{const f=wikiFormat(p.description||'',p.extract||'');if(!f)return;
  out.push({title:bare(p.title),creator:creatorFrom(p.description||'',p.extract||''),format:f,year:yearOf(p.description)||yearOf((p.extract||'').slice(0,200)),description:clip(p.extract||'',900),url:p.fullurl||`https://en.wikipedia.org/?curid=${p.pageid}`,image:p.thumbnail?.source,from:'wikipedia',page:p.title,score:.35-i*.05});});
 return out;
}
const wikiWord:Record<Format,string>={Book:'book',Article:'article',Movie:'film',Documentary:'documentary film',Show:'television series','Podcast episode':'podcast',Album:'album'};
async function wikiResolve(q:WorkQuery,f:Format){
 const hits=await wikipedia(`${q.title} ${q.creator||''} ${wikiWord[f]}`.trim(),5);
 return hits.find(h=>screen(h.format)===screen(f)&&fits(q,h))||null;
}

// ---------- MusicBrainz ----------
type MBGroup={id:string;title:string;'primary-type'?:string;'first-release-date'?:string;'artist-credit'?:{name:string}[]};
async function musicBrainz(q:WorkQuery):Promise<Candidate[]>{
 const esc=(s:string)=>s.replace(/["\\]/g,'');
 const d=await getJson<{'release-groups'?:MBGroup[]}>('https://musicbrainz.org/ws/2/release-group/?'+new URLSearchParams({query:`releasegroup:"${esc(q.title)}"${q.creator?` AND artist:"${esc(q.creator)}"`:''} AND primarytype:album`,fmt:'json',limit:'5'}),{timeout:3500});
 return (d?.['release-groups']||[]).map(g=>({title:g.title,creator:(g['artist-credit']||[]).map(a=>a.name).join(' & '),format:'Album' as const,year:yearOf(g['first-release-date']),description:'',url:`https://musicbrainz.org/release-group/${g.id}`,image:`https://coverartarchive.org/release-group/${g.id}/front-500`,from:'musicbrainz'}));
}

// ---------- Spotify (podcast episodes; SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET, client-credentials only) ----------
let spotifyToken:{value:string;until:number}|null=null;
export const hasSpotify=()=>Boolean(process.env.SPOTIFY_CLIENT_ID&&process.env.SPOTIFY_CLIENT_SECRET);
async function spotifyAuth(){
 if(!hasSpotify())return null;if(spotifyToken&&spotifyToken.until>Date.now()+60000)return spotifyToken.value;
 try{const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/x-www-form-urlencoded',authorization:'Basic '+Buffer.from(process.env.SPOTIFY_CLIENT_ID+':'+process.env.SPOTIFY_CLIENT_SECRET).toString('base64')},body:'grant_type=client_credentials'});
  if(!r.ok)return null;const d=await r.json() as {access_token:string;expires_in:number};spotifyToken={value:d.access_token,until:Date.now()+d.expires_in*1000};return d.access_token;}catch{return null}
}
type SpEpisode={id:string;name:string;description?:string;release_date?:string;images?:{url:string;width?:number}[];external_urls?:{spotify?:string};show?:{name:string;publisher?:string;images?:{url:string}[]}};
// Search results leave out the show, so the top hits are read back in one batch call that includes it.
async function spotifyEpisodes(term:string,timeout=3000):Promise<Candidate[]>{
 const token=await spotifyAuth();if(!token)return [];
 const headers={authorization:'Bearer '+token};
 const found=await getJson<{episodes?:{items?:(SpEpisode|null)[]}}>('https://api.spotify.com/v1/search?'+new URLSearchParams({q:term.slice(0,200),type:'episode',market:'US',limit:'8'}),{timeout,headers});
 const ids=(found?.episodes?.items||[]).filter((x):x is SpEpisode=>Boolean(x?.id)).map(x=>x.id);if(!ids.length)return [];
 const full=await getJson<{episodes?:(SpEpisode|null)[]}>('https://api.spotify.com/v1/episodes?'+new URLSearchParams({ids:ids.join(','),market:'US'}),{timeout,headers});
 return (full?.episodes||[]).filter((e):e is SpEpisode=>Boolean(e?.name&&e.show)).map((e,i)=>({title:e.name,creator:e.show!.name,alt:[e.show!.publisher||''],format:'Podcast episode' as const,year:yearOf(e.release_date),description:clip(e.description||''),url:e.external_urls?.spotify||`https://open.spotify.com/episode/${e.id}`,image:(e.images?.[0]||e.show!.images?.[0])?.url,from:'spotify',score:.28-i*.02}));
}

// ---------- podcast feeds: find an exact episode in the show's own RSS ----------
const unwrap=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;|&#8217;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
const tag=(xml:string,name:string)=>{const m=xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`,'i'));return m?unwrap(m[1]):''};
async function feedEpisode(feedUrl:string,q:WorkQuery,show:{title:string;image?:string;url:string}):Promise<Candidate|null>{
 let url:URL;try{url=new URL(feedUrl);if(url.protocol==='http:')url.protocol='https:';await assertPublic(url)}catch{return null}
 try{
  const res=await fetch(url,{signal:AbortSignal.timeout(9000),headers:{'user-agent':UA,accept:'application/rss+xml,application/xml,text/xml'}});
  if(!res.ok||!res.body)return null;
  const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='',read=0;
  try{while(read<20_000_000){
   const {done,value}=await reader.read();if(done)break;read+=value.length;buffer+=decoder.decode(value,{stream:true});
   const end=buffer.lastIndexOf('</item>');if(end<0)continue;
   for(const item of buffer.slice(0,end).split(/<item[\s>]/i).slice(1)){
    const title=tag(item,'title');if(!title||titleFit(q.title,title)<.8)continue;
    const link=tag(item,'link'),image=item.match(/<itunes:image[^>]+href=["']([^"']+)["']/i)?.[1];
    return {title,creator:show.title,format:'Podcast episode',year:yearOf(tag(item,'pubDate')),description:clip(tag(item,'description')||tag(item,'itunes:summary')),url:link.startsWith('https://')?link:show.url,image:https(image)||show.image,from:'feed'};
   }
   buffer=buffer.slice(end+7);
  }}finally{try{await reader.cancel()}catch{}}
 }catch{}
 return null;
}
async function podcastIndexFeeds(show:string):Promise<{title:string;url:string;image?:string;link?:string}[]>{
 const key=process.env.PODCASTINDEX_API_KEY,secret=process.env.PODCASTINDEX_API_SECRET;if(!key||!secret)return [];
 const date=String(Math.floor(Date.now()/1000));
 try{const r=await fetch('https://api.podcastindex.org/api/1.0/search/byterm?'+new URLSearchParams({q:show,max:'3'}),{signal:AbortSignal.timeout(3500),headers:{'user-agent':UA,'X-Auth-Key':key,'X-Auth-Date':date,Authorization:createHash('sha1').update(key+secret+date).digest('hex')}});
  const d=r.ok?await r.json() as {feeds?:{title:string;url:string;image?:string;link?:string}[]}:null;return d?.feeds||[];}catch{return []}
}
async function podcastEpisode(q:WorkQuery):Promise<Candidate|null>{
 const term=`${q.title} ${q.creator||''}`.trim();
 const direct=(await Promise.all([itunesEpisodes(term),itunesEpisodes(q.title),spotifyEpisodes(term)])).flat();
 const hit=direct.find(c=>fits(q,c,.8));if(hit)return hit;
 if(!q.creator)return null;
 const shows=(await itunes(q.creator,'podcast','podcast',3000,5)).filter(s=>s.feedUrl&&overlap(q.creator!,s.collectionName||'')>=.6);
 for(const s of shows.slice(0,2)){const ep=await feedEpisode(s.feedUrl!,q,{title:s.collectionName||q.creator,image:art(s),url:https(s.collectionViewUrl)||''});if(ep)return ep;}
 for(const f of (await podcastIndexFeeds(q.creator)).filter(f=>overlap(q.creator!,f.title)>=.6).slice(0,1)){const ep=await feedEpisode(f.url,q,{title:f.title,image:https(f.image),url:https(f.link)||''});if(ep)return ep;}
 return null;
}

// ---------- articles: from a URL ----------
async function article(url:string):Promise<Candidate|null>{
 const p=await openPage(url,1200);if(!p.ok||!p.title)return null;
 let host='';try{host=new URL(p.url).hostname.replace(/^www\./,'')}catch{}
 return {title:p.title.replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/,'').trim(),creator:p.site||host,format:'Article',year:yearOf(p.published),description:clip(p.description||p.text.slice(0,600)),url:p.url,image:p.image?.startsWith('https://')?p.image:undefined,from:'page'};
}

// ---------- resolve one known work: identity, canonical link, cover ----------
export async function resolveWork(q:WorkQuery):Promise<Candidate|null>{
 const f=formatOf(q.format);if(!f)return null;
 const first=async(tries:(()=>Promise<Candidate[]|Candidate|null>)[])=>{
  // Cheap sources in parallel, accepted in priority order.
  const all=await Promise.all(tries.map(t=>t().catch(()=>null)));
  for(const r of all){const list=Array.isArray(r)?r:r?[r]:[];const hit=list.find(c=>fits(q,c)&&(f==='Book'||f==='Album'||f==='Podcast episode'||screen(c.format)===screen(f)));if(hit)return hit;}
  return null;
 };
 let found:Candidate|null=null;
 if(f==='Book')found=await first([()=>openLibrary({title:q.title,...(q.creator?{author:q.creator}:{})}),()=>googleBooks(`intitle:${q.title}${q.creator?` inauthor:${q.creator}`:''}`),()=>wikiResolve(q,f)]);
 else if(f==='Movie'||f==='Documentary')found=await first([()=>tmdbSearch(q.title,'movie'),()=>itunesScreen(q.title,'movie'),()=>wikiResolve(q,f)]);
 else if(f==='Show')found=await first([()=>tmdbSearch(q.title,'tv'),()=>itunesScreen(q.title,'tv'),()=>wikiResolve(q,f)]);
 else if(f==='Album')found=await first([()=>itunesAlbums(`${q.title} ${q.creator||''}`.trim()),()=>musicBrainz(q),()=>wikiResolve(q,f)]);
 else if(f==='Podcast episode')found=await podcastEpisode(q);
 else if(f==='Article'&&q.url?.startsWith('https://'))found=await article(q.url);
 if(!found)return null;
 found={...found,format:f==='Documentary'&&found.format==='Movie'?'Documentary':found.format};
 return withArt(found);
}
// Fallback chain for a cover: catalog -> Wikipedia page image -> og:image of its page -> none (typographic plate).
async function withArt(c:Candidate):Promise<Candidate>{
 if(c.image)return c;
 if(c.format!=='Article'&&c.format!=='Podcast episode'){const w=await wikiResolve({title:c.title,creator:c.creator,format:c.format},c.format).catch(()=>null);if(w?.image)return {...c,image:w.image};}
 if(c.url&&!/wikipedia\.org|openlibrary\.org|musicbrainz\.org/.test(c.url)){const p=await openPage(c.url,200).catch(()=>null);if(p?.ok&&p.image?.startsWith('https://'))return {...c,image:p.image};}
 return c;
}

// ---------- typeahead search ----------
const merge=(a:Candidate,b:Candidate):Candidate=>({...a,creator:a.creator||b.creator,alt:[...(a.alt||[]),b.creator,...(b.alt||[])].filter(Boolean),year:a.year||b.year,description:a.description.length>=120?a.description:(b.description.length>a.description.length?b.description:a.description),image:a.image||b.image,score:Math.max(a.score||0,b.score||0)+.15});
const PRIORITY=['tmdb','openlibrary','itunes','spotify','googlebooks','feed','musicbrainz','wikipedia','page'];
function sameWork(a:Candidate,b:Candidate){
 if(screen(a.format)!==screen(b.format)||titleFit(a.title,b.title)<.9)return false;
 if(a.year&&b.year&&Math.abs(Number(a.year)-Number(b.year))>1)return false;
 return !a.creator||!b.creator||overlap(a.creator,b.creator)>0||overlap(b.creator,a.creator)>0;
}
export async function searchCatalog(query:string,opts:{format?:Format;limit?:number}={}):Promise<Candidate[]>{
 const q=query.trim().slice(0,200);if(q.length<2)return [];
 if(/^https:\/\/\S+$/i.test(q)){const a=await article(q);return a?[a]:[];}
 const want=(g:string)=>!opts.format||screen(opts.format)===g||(g==='Show'&&opts.format==='Show');
 const tasks:Promise<Candidate[]>[]=[];
 if(want('Book'))tasks.push(openLibrary({q},1400),googleBooks(q,1500));
 if(want('film')||want('Show'))tasks.push(hasTmdb()?tmdbSearch(q,undefined,1500):Promise.all([itunesScreen(q,'movie',1500),itunesScreen(q,'tv',1500)]).then(x=>x.flat()));
 if(want('Podcast episode'))tasks.push(itunesEpisodes(q,1500),spotifyEpisodes(q,1500));
 if(want('Album'))tasks.push(itunesAlbums(q,1500));
 if(!opts.format||opts.format!=='Podcast episode')tasks.push(wikipedia(q,8,1500));
 const found=(await Promise.all(tasks.map(t=>t.catch(()=>[] as Candidate[])))).flat().filter(c=>c.title&&c.url&&(!opts.format||screen(c.format)===screen(opts.format)));
 found.sort((a,b)=>PRIORITY.indexOf(a.from)-PRIORITY.indexOf(b.from));
 const merged:Candidate[]=[];
 for(const c of found){const i=merged.findIndex(m=>sameWork(m,c));if(i>=0)merged[i]=merge(merged[i],c);else merged.push({...c});}
 const qb=bare(q).toLowerCase();
 const rank=(c:Candidate)=>{const t=bare(c.title).toLowerCase();return 2*titleFit(q,c.title)+overlap(q,c.title)+(t===qb?1:t.startsWith(qb)?.4:0)+(c.score||0)+(c.image?.2:0)+(c.creator?.1:0)-(c.format==='Podcast episode'&&overlap(q,c.title)<.5?.8:0)};
 return merged.map(c=>({...c,score:rank(c)})).filter(c=>(c.score||0)>=.9).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,opts.limit||5);
}

// A fuller dossier for the confirmed work, from its catalog page and Wikipedia. Never blocks for long.
export async function describe(c:Candidate):Promise<string>{
 let text=c.description;
 if(c.from==='openlibrary'&&text.length<200)text=(await openLibraryDescription(c.url).catch(()=>''))||text;
 if(text.length<400&&c.format!=='Podcast episode'&&c.format!=='Article'){
  const w=await Promise.race([wikiResolve({title:c.title,creator:c.creator,format:c.format},c.format).catch(()=>null),new Promise<null>(r=>setTimeout(()=>r(null),2500))]);
  if(w?.description&&w.description!==text)text=text?`${text} ${w.description}`:w.description;
 }
 return clip(text||`${c.title}, a ${c.format.toLowerCase()} by ${c.creator}${c.year?` (${c.year})`:''}.`,1300);
}

// ---------- signed candidates: what the search returned is what gets confirmed ----------
const candidateSchema=z.object({title:z.string().min(1).max(240),creator:z.string().max(240),format:z.enum(FORMATS),year:z.string().max(40),description:z.string().max(1400),url:z.string().url().refine(u=>u.startsWith('https://')),image:z.string().url().optional(),from:z.string().max(20)});
const secret=()=>process.env.CATALOG_SECRET||createHash('sha256').update('threeangle-catalog:'+(process.env.ANTHROPIC_API_KEY||process.env.DATABASE_URL||process.env.VERCEL_PROJECT_ID||'dev')).digest('hex');
const mac=(body:string)=>createHmac('sha256',secret()).update(body).digest('base64url');
export function signCandidate(c:Candidate){const {title,creator,format,year,description,url,image,from}=c;const body=Buffer.from(JSON.stringify({title,creator,format,year,description,url,image,from})).toString('base64url');return body+'.'+mac(body);}
export function readCandidate(token:string):Candidate|null{
 const [body,sig]=token.split('.');if(!body||!sig)return null;
 const want=Buffer.from(mac(body)),got=Buffer.from(sig);if(want.length!==got.length||!timingSafeEqual(want,got))return null;
 try{const parsed=candidateSchema.safeParse(JSON.parse(Buffer.from(body,'base64url').toString('utf8')));return parsed.success?parsed.data:null}catch{return null}
}

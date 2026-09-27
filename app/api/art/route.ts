import {findArt} from '@/lib/art';
export const runtime='nodejs';

// GET /api/art?t=<title>&c=<creator>&f=<format>[&u=<page url>] -> {url: string|null}
// Covers change rarely, so answers are cached at the edge for a month (misses for a day).
const memo=new Map<string,Promise<string|null>>();
export async function GET(request:Request){
 const q=new URL(request.url).searchParams;
 const title=(q.get('t')||'').trim().slice(0,240),creator=(q.get('c')||'').trim().slice(0,240),format=(q.get('f')||'').trim().slice(0,40),url=(q.get('u')||'').trim().slice(0,600);
 if(title.length<1||!format)return Response.json({url:null},{status:400});
 const key=[title,creator,format,url].join('\u0000').toLowerCase();
 if(!memo.has(key)){memo.set(key,findArt({title,creator,format,url:url.startsWith('https://')?url:undefined}).catch(()=>null));if(memo.size>2000)memo.delete(memo.keys().next().value!);}
 const found=await memo.get(key)!;
 return Response.json({url:found},{headers:{'Cache-Control':found?'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800':'public, max-age=3600, s-maxage=86400'}});
}

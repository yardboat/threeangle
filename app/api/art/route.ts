import {resolveWork} from '@/lib/catalog';
import {overLimit,tooMany} from '@/lib/limit';
export const runtime='nodejs';

// GET /api/art?t=<title>&c=<creator>&f=<format>[&u=<page url>] -> {url: string|null}
// Fallback only: works carry their cover (`image`) from the moment they are found. Cached at the edge.
export async function GET(request:Request){
 if(overLimit(request,'art',120))return tooMany();
 const q=new URL(request.url).searchParams;
 const title=(q.get('t')||'').trim().slice(0,240),creator=(q.get('c')||'').trim().slice(0,240),format=(q.get('f')||'').trim().slice(0,40),url=(q.get('u')||'').trim().slice(0,600);
 if(title.length<1||!format)return Response.json({url:null},{status:400});
 const found=await resolveWork({title,creator,format,url:url.startsWith('https://')?url:undefined}).catch(()=>null);
 return Response.json({url:found?.image||null,link:found?.url||null},{headers:{'Cache-Control':found?.image?'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800':'public, max-age=3600, s-maxage=86400'}});
}

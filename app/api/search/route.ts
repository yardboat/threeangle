import {searchCatalog,signCandidate} from '@/lib/catalog';
import {FORMATS,type Format} from '@/lib/formats';
import {overLimit,tooMany} from '@/lib/limit';
export const runtime='nodejs';

// GET /api/search?q=<title or https URL>[&f=<format>] -> {candidates:[...]} for the typeahead.
// Each candidate carries a signed token; confirming one (POST /api/corner {action:'pick',token}) trusts only that.
export async function GET(request:Request){
 if(overLimit(request,'search',90))return tooMany();
 const params=new URL(request.url).searchParams,q=(params.get('q')||'').trim().slice(0,200),f=params.get('f');
 const format=FORMATS.includes(f as Format)?f as Format:undefined;
 if(q.length<2)return Response.json({candidates:[]});
 const started=Date.now();
 const found=await searchCatalog(q,{format,limit:5}).catch(()=>[]);
 const candidates=found.map(c=>({title:c.title,creator:c.creator,format:c.format,year:c.year,description:c.description.slice(0,240),image:c.image||null,url:c.url,from:c.from,token:signCandidate(c)}));
 return Response.json({candidates,ms:Date.now()-started},{headers:{'Cache-Control':candidates.length?'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800':'public, max-age=60, s-maxage=600'}});
}

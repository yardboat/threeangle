import {proxiable} from '@/lib/images';
import {overLimit,tooMany} from '@/lib/limit';
export const runtime='nodejs';

// GET /api/img?u=<catalog image URL> -> the image, cached for a year at the edge. Only catalog hosts are allowed.
const MAX=8_000_000;
export async function GET(request:Request){
 if(overLimit(request,'img',400))return tooMany();
 const u=new URL(request.url).searchParams.get('u')||'';
 if(!proxiable(u))return new Response('Not allowed',{status:400});
 try{
  const r=await fetch(u,{signal:AbortSignal.timeout(9000),headers:{'user-agent':'threeangle/1.0 (https://threeangle.app; cover proxy)',accept:'image/avif,image/webp,image/*'}});
  const type=r.headers.get('content-type')||'';
  if(!r.ok||!type.startsWith('image/')||Number(r.headers.get('content-length')||0)>MAX)return new Response('No image',{status:404,headers:{'Cache-Control':'public, max-age=3600, s-maxage=86400'}});
  const body=await r.arrayBuffer();if(body.byteLength>MAX)return new Response('Too large',{status:404});
  return new Response(body,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=604800, s-maxage=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}
}

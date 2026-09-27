// A basic per-address rate limit, per server instance. It stops a runaway client, not a determined one;
// the rate limits here and the per-browser draft lock are the only ceilings on model spend (no daily quota).
const hits=new Map<string,number[]>();
export function clientAddress(request:Request){return (request.headers.get('x-forwarded-for')||'').split(',')[0].trim()||request.headers.get('x-real-ip')||'unknown'}
export function overLimit(request:Request,bucket:string,max:number,windowMs=60000){
 const key=bucket+':'+clientAddress(request),now=Date.now();
 const recent=(hits.get(key)||[]).filter(t=>now-t<windowMs);recent.push(now);hits.set(key,recent);
 if(hits.size>5000)for(const [k,v] of hits)if(!v.length||now-v[v.length-1]>windowMs)hits.delete(k);
 return recent.length>max;
}
export const tooMany=()=>Response.json({error:'Too many requests. Give it a moment.'},{status:429,headers:{'Retry-After':'30','Cache-Control':'no-store'}});

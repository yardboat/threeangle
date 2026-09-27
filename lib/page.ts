import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';

// ---------- safe page access ----------
export type Page={ok:boolean;status:number;url:string;title:string;description:string;text:string;image?:string;site?:string;published?:string;error?:string};
const emptyPage=(url:string,status:number,error:string):Page=>({ok:false,status,url,title:'',description:'',text:'',error});
function privateAddress(ip:string){
if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||a>=224}
const v=ip.toLowerCase();return v==='::1'||v==='::'||v.startsWith('fc')||v.startsWith('fd')||v.startsWith('fe80')||v.startsWith('::ffff:');
}
export async function assertPublic(url:URL){
if(url.protocol!=='https:')throw new Error('Only https pages can be opened.');
const host=url.hostname;
if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||isIP(host))throw new Error('That address is not allowed.');
const addresses=await dnsLookup(host,{all:true});
if(!addresses.length||addresses.some(a=>privateAddress(a.address)))throw new Error('That address is not allowed.');
}
async function readCapped(res:Response,limit:number){
if(!res.body)return '';
const reader=res.body.getReader(),decoder=new TextDecoder();let out='';
while(out.length<limit){const {done,value}=await reader.read();if(done)break;out+=decoder.decode(value,{stream:true})}
try{await reader.cancel()}catch{}
return out.slice(0,limit);
}
const decodeEntities=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const metaContent=(html:string,key:string)=>{const m=html.match(new RegExp('<meta[^>]+(?:name|property)=["\']'+key+'["\'][^>]*>','i'));const c=m&&m[0].match(/content=["']([^"']*)["']/i);return c?decodeEntities(c[1]).trim():''};
export async function openPage(raw:string,maxChars=4000):Promise<Page>{
let url:URL;
try{url=new URL(raw)}catch{return emptyPage(raw,0,'Invalid URL')}
try{
for(let hop=0;hop<4;hop++){
await assertPublic(url);
const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'user-agent':'Mozilla/5.0 (compatible; threeangle-verifier/1.0)',accept:'text/html,application/xhtml+xml,text/plain'}});
const next=res.headers.get('location');
if(res.status>=300&&res.status<400&&next){url=new URL(next,url);continue}
if(!res.ok)return emptyPage(url.href,res.status,'HTTP '+res.status);
if(!/html|xml|text/i.test(res.headers.get('content-type')||''))return {ok:true,status:res.status,url:url.href,title:'',description:'',text:'',error:'Not a web page'};
const html=await readCapped(res,600000);
const title=decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').trim()||metaContent(html,'og:title');
const description=metaContent(html,'og:description')||metaContent(html,'description');
const image=metaContent(html,'og:image')||metaContent(html,'twitter:image');
const site=metaContent(html,'og:site_name')||metaContent(html,'application-name'),published=metaContent(html,'article:published_time')||metaContent(html,'date')||metaContent(html,'parsely-pub-date');
const text=decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().slice(0,maxChars);
return {ok:true,status:res.status,url:url.href,title,description,text,image:image?new URL(image,url).href:undefined,site:site||undefined,published:published||undefined};
}
return emptyPage(url.href,0,'Too many redirects');
}catch(e){return emptyPage(raw,0,e instanceof Error?e.message:'Could not open the page')}
}

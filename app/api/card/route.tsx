/* eslint-disable @next/next/no-img-element -- ImageResponse draws plain img elements */
import {ImageResponse} from 'next/og';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {topics,type Topic,type Work} from '@/lib/stories';
import {crateDb} from '@/db/crate';
import {resolveWork} from '@/lib/catalog';
import {overLimit,tooMany} from '@/lib/limit';
import {assertPublic} from '@/lib/page';
export const runtime='nodejs';
export const maxDuration=30;

// GET /api/card?id=<topic id> -> a 1080×1920 JPEG for Instagram (and any) stories:
// the threeangle's name, its three covers standing around the drawing, and where to make your own.
// Instagram covers roughly the top 250 px and bottom 250 px with its own UI, so the content stays inside.

const W=1080,H=1920;
const MODES=['Read','Watch','Listen'];
const GILT='#d4b06c',BONE='#f3eee5',MUTE='#c4baab';
const here=(...p:string[])=>join(process.cwd(),...p);
let fonts:Promise<{name:string;data:Buffer;weight:400|500|600|800;style:'normal'|'italic'}[]>|null=null;
const loadFonts=()=>fonts??=Promise.all([
 readFile(here('app/api/card/fonts/archivo-xb-expanded.ttf')).then(data=>({name:'Archivo Expanded',data,weight:800 as const,style:'normal' as const})),
 readFile(here('app/api/card/fonts/archivo-sb.ttf')).then(data=>({name:'Archivo',data,weight:600 as const,style:'normal' as const})),
 readFile(here('app/api/card/fonts/cormorant-500.ttf')).then(data=>({name:'Cormorant',data,weight:500 as const,style:'normal' as const})),
 readFile(here('app/api/card/fonts/cormorant-italic.ttf')).then(data=>({name:'Cormorant',data,weight:400 as const,style:'italic' as const})),
]);
let backdrop:Promise<string>|null=null;
const loadBackdrop=()=>backdrop??=readFile(here('public/card/rotunda-story.jpg')).then(b=>'data:image/jpeg;base64,'+b.toString('base64'));

async function findTopic(id:string):Promise<Topic|null>{
 const curated=topics.find(t=>t.id===id);if(curated)return curated;
 const m=id.match(/^custom-([0-9a-f-]{36})$/);if(!m)return null;
 const row=await crateDb().prepare('SELECT result FROM corner_draft WHERE id=?').bind(m[1]).first<{result:string|null}>();
 return row?.result?JSON.parse(row.result) as Topic:null;
}
// A cover as a data URI (the renderer draws JPEG and PNG only); null means the typographic plate.
async function coverOf(w:Work&{image?:string}):Promise<string|null>{
 try{
  const url=w.image||(await resolveWork({title:w.title,creator:w.creator,format:w.format}).catch(()=>null))?.image;
  if(!url||!url.startsWith('https://'))return null;
  // Article covers can come from any site: only public addresses are fetched.
  await assertPublic(new URL(url));
  const r=await fetch(url,{signal:AbortSignal.timeout(5000),headers:{'user-agent':'threeangle/1.0 (story card)'}});
  const type=(r.headers.get('content-type')||'').split(';')[0];
  if(!r.ok||!/^image\/(jpeg|jpg|png)$/.test(type))return null;
  const b=Buffer.from(await r.arrayBuffer());if(b.length>4_000_000)return null;
  return `data:${type};base64,${b.toString('base64')}`;
 }catch{return null}
}
const shape=(format:string)=>{const f=format.toLowerCase();return f.includes('podcast')||f.includes('album')?1:f.includes('article')?.75:1.5;};

// The threeangle, drawn: a pyramid on its turntable, in gilt ink. Nothing is ever laid over it.
const DRAWING=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -130 260 230" fill="none" stroke="${GILT}" stroke-linecap="round" stroke-linejoin="round">
<ellipse cx="0" cy="62" rx="120" ry="30" stroke-width="1.6" opacity=".85"/><ellipse cx="0" cy="62" rx="108" ry="25" stroke-width=".8" stroke-dasharray="3 5" opacity=".7"/>
<path d="M0 -118 L-92 58 L92 58 Z" stroke-width="2.6"/><path d="M0 -118 L16 30" stroke-width="2.2"/><path d="M-92 58 L16 30 L92 58" stroke-width="1.2" stroke-dasharray="4 5" opacity=".7"/>
<path d="M0 -118 V78" stroke-width=".8" stroke-dasharray="2 5" opacity=".6"/><circle cx="0" cy="-118" r="5" stroke-width="1.6"/><circle cx="0" cy="-118" r="11" stroke-width=".8" opacity=".6"/>
${Array.from({length:9},(_,i)=>{const t=(i+1)/10;return `<path d="M${-92*t} ${-118+176*t} L${92*t} ${-118+176*t}" stroke-width=".7" opacity=".45"/>`}).join('')}</svg>`;
const drawingUri='data:image/svg+xml;base64,'+Buffer.from(DRAWING).toString('base64');

// One work: its cover (or a typographic plate, never a second copy of the title) on a shared baseline,
// then the angle and the title, set the same way for all three.
const COVER_H=300;
const clip=(t:string,n:number)=>t.length>n?t.slice(0,n-2).replace(/\s+\S*$/,'')+'…':t;
function CoverCard({work,art,mode,letter}:{work:Work;art:string|null;mode:string;letter:string}){
 const ratio=shape(work.format),h=ratio>1?COVER_H:Math.round(COVER_H*.78),w=Math.round(h/ratio);
 const title=clip(work.title,52);
 return <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:300}}>
  <div style={{display:'flex',alignItems:'flex-end',justifyContent:'center',height:COVER_H,width:300}}>
   <div style={{display:'flex',width:w,height:h,position:'relative',background:'linear-gradient(160deg,#2a211a,#15110d)',border:'1px solid rgba(212,176,108,.5)',boxShadow:'0 30px 50px rgba(0,0,0,.75)'}}>
    {art?<img src={art} width={w} height={h} style={{width:w,height:h,objectFit:'cover'}} alt=""/>
    :<div style={{display:'flex',width:'100%',height:'100%',padding:9}}><div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',border:'1px solid rgba(212,176,108,.24)'}}>
      <div style={{display:'flex',fontFamily:'Cormorant',fontStyle:'italic',fontSize:96,lineHeight:1,color:GILT}}>{letter}</div>
      <div style={{display:'flex',marginTop:14,fontFamily:'Archivo',fontSize:13,letterSpacing:3,color:MUTE,textTransform:'uppercase'}}>{clip(work.format,22)}</div>
     </div></div>}
   </div>
  </div>
  <div style={{display:'flex',marginTop:30,fontFamily:'Archivo',fontSize:18,letterSpacing:6,color:GILT,textTransform:'uppercase'}}>{mode}</div>
  <div style={{display:'flex',marginTop:10,height:76,width:290,fontFamily:'Cormorant',fontWeight:500,fontSize:title.length>28?28:33,lineHeight:1.08,color:BONE,textAlign:'center',justifyContent:'center'}}>{title}</div>
 </div>;
}

export async function GET(request:Request){
 if(overLimit(request,'card',40))return tooMany();
 const id=new URL(request.url).searchParams.get('id')||'';
 const topic=await findTopic(id).catch(()=>null);
 if(!topic)return Response.json({error:'That threeangle was not found.'},{status:404});
 const works=topic.works.slice(0,3) as (Work&{image?:string})[];
 const [font,bg,...arts]=await Promise.all([loadFonts(),loadBackdrop(),...works.map(coverOf)]);
 const name=topic.name.replace(/\.$/,'');
 const nameSize=name.length>30?80:name.length>20?96:name.length>12?116:140;
 const host=new URL(request.url).host.replace(/^www\./,'');
 // Instagram keeps roughly the top and bottom 250 px for its own UI; everything sits between them, in three
 // bands: the name, the drawing, the three works.
 const drawn=new ImageResponse(
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:W,height:H,position:'relative',background:'#0d0b09',color:BONE}}>
   <img src={bg} width={W} height={H} style={{position:'absolute',left:0,top:0,width:W,height:H}} alt=""/>
   <div style={{display:'flex',position:'absolute',left:0,top:0,width:W,height:H,background:'linear-gradient(180deg,rgba(10,8,6,.8) 0%,rgba(10,8,6,.35) 34%,rgba(10,8,6,.3) 52%,rgba(10,8,6,.88) 74%,rgba(10,8,6,.95) 100%)'}}/>
   <div style={{display:'flex',position:'absolute',left:W/2-300,top:620,width:600,height:620,background:'radial-gradient(ellipse at 50% 60%,rgba(255,228,180,.2),rgba(255,228,180,0) 68%)'}}/>
   {/* the name */}
   <div style={{display:'flex',flexDirection:'column',alignItems:'center',position:'absolute',left:0,top:250,width:W}}>
    <div style={{display:'flex',alignItems:'center',fontFamily:'Archivo Expanded',fontSize:24,letterSpacing:10,color:BONE}}>THREEANGLE</div>
    <div style={{display:'flex',marginTop:14,width:64,height:2,background:GILT,opacity:.8}}/>
    <div style={{display:'flex',marginTop:40,padding:'0 70px',fontFamily:'Archivo Expanded',fontSize:nameSize,lineHeight:.9,letterSpacing:-1,textAlign:'center',justifyContent:'center',textTransform:'uppercase',color:BONE}}>{name}</div>
    {topic.hook&&<div style={{display:'flex',marginTop:30,padding:'0 120px',fontFamily:'Cormorant',fontStyle:'italic',fontSize:40,lineHeight:1.15,color:MUTE,textAlign:'center',justifyContent:'center'}}>{clip(topic.hook,110)}</div>}
   </div>
   {/* the drawing, alone at the centre */}
   <img src={drawingUri} width={420} height={372} style={{position:'absolute',left:(W-420)/2,top:748}} alt=""/>
   {/* the three works, on one baseline */}
   <div style={{display:'flex',position:'absolute',left:(W-960)/2,top:1150,width:960,justifyContent:'space-between'}}>
    {works.map((w,i)=><CoverCard key={i} work={w} art={arts[i]} mode={MODES[i]} letter={'abc'[i]}/>)}
   </div>
   <div style={{display:'flex',position:'absolute',top:1640,width:W,justifyContent:'center',fontFamily:'Archivo',fontSize:19,letterSpacing:6,color:MUTE,textTransform:'uppercase'}}>Find yours · {host}</div>
  </div>,
  {width:W,height:H,fonts:await font}
 );
 // Stories take a JPEG: full-resolution colour (4:4:4) so the gilt lines and small type stay crisp.
 const jpeg=await sharp(Buffer.from(await drawn.arrayBuffer())).jpeg({quality:90,mozjpeg:true,chromaSubsampling:'4:4:4'}).toBuffer();
 return new Response(new Uint8Array(jpeg),{headers:{'Content-Type':'image/jpeg','Content-Disposition':'inline; filename="threeangle-story.jpg"','Cache-Control':'public, max-age=3600, s-maxage=86400'}});
}

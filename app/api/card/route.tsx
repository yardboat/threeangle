/* eslint-disable @next/next/no-img-element -- ImageResponse draws plain img elements */
import {ImageResponse} from 'next/og';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {topics,type Topic,type Work} from '@/lib/stories';
import {crateDb} from '@/db/crate';
import {resolveWork} from '@/lib/catalog';
import {overLimit,tooMany} from '@/lib/limit';
import {assertPublic} from '@/lib/page';
export const runtime='nodejs';
export const maxDuration=30;

// GET /api/card?id=<topic id> -> a 1080×1920 PNG for Instagram (and any) stories:
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

// The threeangle, drawn: a pyramid on its turntable, in gilt ink.
const DRAWING=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -140 260 250" fill="none" stroke="${GILT}" stroke-linecap="round" stroke-linejoin="round">
<ellipse cx="0" cy="62" rx="120" ry="30" stroke-width="1.6" opacity=".85"/><ellipse cx="0" cy="62" rx="108" ry="25" stroke-width=".8" stroke-dasharray="3 5" opacity=".7"/>
<path d="M0 -118 L-92 58 L92 58 Z" stroke-width="2.6"/><path d="M0 -118 L16 30" stroke-width="2.2"/><path d="M-92 58 L16 30 L92 58" stroke-width="1.2" stroke-dasharray="4 5" opacity=".7"/>
<path d="M0 -118 V78" stroke-width=".8" stroke-dasharray="2 5" opacity=".6"/><circle cx="0" cy="-118" r="5" stroke-width="1.6"/><circle cx="0" cy="-118" r="11" stroke-width=".8" opacity=".6"/>
${Array.from({length:9},(_,i)=>{const t=(i+1)/10;return `<path d="M${-92*t} ${-118+176*t} L${92*t} ${-118+176*t}" stroke-width=".7" opacity=".45"/>`}).join('')}
<path d="M112 -90 V58 M106 -90 H118 M106 58 H118" stroke-width=".9" opacity=".7"/></svg>`;
const drawingUri='data:image/svg+xml;base64,'+Buffer.from(DRAWING).toString('base64');

function CoverCard({work,art,mode,width}:{work:Work;art:string|null;mode:string;width:number}){
 const h=Math.round(width*shape(work.format));
 return <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:width+40}}>
  <div style={{display:'flex',width,height:h,position:'relative',background:'linear-gradient(160deg,#2a211a,#15110d)',border:'1px solid rgba(212,176,108,.45)',boxShadow:'0 30px 50px rgba(0,0,0,.7)'}}>
   {art?<img src={art} width={width} height={h} style={{width,height:h,objectFit:'cover'}} alt=""/>
   :<div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',padding:18,textAlign:'center'}}>
     <div style={{fontFamily:'Archivo',fontSize:13,letterSpacing:3,color:GILT,textTransform:'uppercase',marginBottom:10}}>{work.format}</div>
     <div style={{fontFamily:'Cormorant',fontWeight:500,fontSize:30,lineHeight:1.05,color:BONE}}>{work.title}</div>
    </div>}
  </div>
  <div style={{display:'flex',marginTop:22,fontFamily:'Archivo',fontSize:17,letterSpacing:5,color:GILT,textTransform:'uppercase'}}>{mode}</div>
  <div style={{display:'flex',marginTop:6,fontFamily:'Cormorant',fontWeight:500,fontSize:work.title.length>34?26:31,lineHeight:1.05,color:BONE,textAlign:'center',justifyContent:'center'}}>{work.title.length>60?work.title.slice(0,57).replace(/\s+\S*$/,'')+'…':work.title}</div>
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
 const nameSize=name.length>30?76:name.length>20?92:name.length>12?112:136;
 const host=new URL(request.url).host.replace(/^www\./,'');
 return new ImageResponse(
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:W,height:H,position:'relative',background:'#0d0b09',color:BONE}}>
   <img src={bg} width={W} height={H} style={{position:'absolute',left:0,top:0,width:W,height:H}} alt=""/>
   <div style={{display:'flex',position:'absolute',left:0,top:0,width:W,height:H,background:'linear-gradient(180deg,rgba(10,8,6,.72) 0%,rgba(10,8,6,.15) 30%,rgba(10,8,6,.2) 62%,rgba(10,8,6,.85) 100%)'}}/>
   <div style={{display:'flex',position:'absolute',left:W/2-230,top:560,width:460,height:1000,background:'radial-gradient(ellipse at 50% 70%,rgba(255,228,180,.22),rgba(255,228,180,0) 70%)'}}/>
   {/* header */}
   <div style={{display:'flex',alignItems:'center',marginTop:250,fontFamily:'Archivo Expanded',fontSize:26,letterSpacing:10,color:BONE}}>THREEANGLE</div>
   <div style={{display:'flex',marginTop:64,fontFamily:'Archivo',fontSize:19,letterSpacing:7,color:GILT,textTransform:'uppercase'}}>Read · Watch · Listen</div>
   <div style={{display:'flex',marginTop:22,padding:'0 70px',fontFamily:'Archivo Expanded',fontSize:nameSize,lineHeight:.9,letterSpacing:-1,textAlign:'center',justifyContent:'center',textTransform:'uppercase',color:BONE}}>{name}</div>
   {topic.hook&&<div style={{display:'flex',marginTop:30,padding:'0 110px',fontFamily:'Cormorant',fontStyle:'italic',fontSize:40,lineHeight:1.15,color:MUTE,textAlign:'center',justifyContent:'center'}}>{topic.hook}</div>}
   {/* the constellation */}
   <div style={{display:'flex',position:'relative',width:W,height:900,marginTop:40}}>
    <img src={drawingUri} width={420} height={404} style={{position:'absolute',left:(W-420)/2,top:250}} alt=""/>
    <div style={{display:'flex',position:'absolute',left:70,top:40}}><CoverCard work={works[0]} art={arts[0]} mode={MODES[0]} width={250}/></div>
    <div style={{display:'flex',position:'absolute',right:70,top:40}}><CoverCard work={works[1]} art={arts[1]} mode={MODES[1]} width={250}/></div>
    <div style={{display:'flex',position:'absolute',left:(W-290)/2,top:560}}><CoverCard work={works[2]} art={arts[2]} mode={MODES[2]} width={210}/></div>
   </div>
   <div style={{display:'flex',position:'absolute',bottom:250,fontFamily:'Archivo',fontSize:20,letterSpacing:6,color:MUTE,textTransform:'uppercase'}}>Find yours · {host}</div>
  </div>,
  {width:W,height:H,fonts:await font,headers:{'Cache-Control':'public, max-age=3600, s-maxage=86400'}}
 );
}

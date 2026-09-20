import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'threeangle / Preview review',robots:{index:false,follow:false}};
export default async function Review({searchParams}:{searchParams:Promise<{width?:string;triangle?:string}>}){
 if(process.env.VERCEL_ENV==='production')notFound();
 const query=await searchParams;const width=[320,390,768].includes(Number(query.width))?Number(query.width):390;
 const src='/v2'+(query.triangle?'?triangle='+encodeURIComponent(query.triangle):'');
 return <main style={{minHeight:'100vh',padding:'20px',background:'#e8e3d9',color:'#4a2f22',fontFamily:'sans-serif',textAlign:'center'}}><nav style={{display:'flex',justifyContent:'center',gap:'20px',marginBottom:'18px'}}>{[320,390,768].map(w=><a key={w} href={'?width='+w+(query.triangle?'&triangle='+encodeURIComponent(query.triangle):'')}>{w}px</a>)}<a href={src}>Full window</a></nav><iframe title="Responsive threeangle preview" src={src} style={{display:'block',width,maxWidth:'100%',height:844,border:'1px solid #b8955a',margin:'auto',background:'#fbf9f4'}}/></main>;
}

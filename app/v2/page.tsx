import type {Metadata} from 'next';
import localFont from 'next/font/local';
import Hall from './hall';
import './monument.css';
const display=localFont({src:[{path:'./fonts/CormorantGaramond.woff2',weight:'300 700',style:'normal'},{path:'./fonts/CormorantGaramond-Italic.woff2',weight:'300 700',style:'italic'}],variable:'--hall-display',display:'swap'});
// Archivo carries the monument: expanded caps for the big statements, normal width for the interface.
const ui=localFont({src:'./fonts/Archivo.woff2',weight:'100 900',variable:'--hall-ui',display:'swap',declarations:[{prop:'font-stretch',value:'62% 125%'}]});
export const metadata:Metadata={title:'threeangle / A little more connected.',description:'Bring a title you love. Discover two complementary works and the idea that brings them together.',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{triangle?:string;start?:string}>}){
 const query=await searchParams;
 return <div className={`${display.variable} ${ui.variable}`}><Hall initialId={typeof query.triangle==='string'?query.triangle:undefined} startWithTitle={query.start==='title'}/></div>;
}

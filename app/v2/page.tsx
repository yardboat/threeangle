import type {Metadata} from 'next';
import localFont from 'next/font/local';
import Hall from './hall';
import './hall.css';
import './triangle.css';
import './flow.css';
import './atmosphere.css';
const display=localFont({src:[{path:'./fonts/CormorantGaramond.woff2',weight:'300 700',style:'normal'},{path:'./fonts/CormorantGaramond-Italic.woff2',weight:'300 700',style:'italic'}],variable:'--hall-display',display:'swap'});
const ui=localFont({src:'./fonts/DMSans.woff2',variable:'--hall-ui',weight:'100 1000',display:'swap'});
export const metadata:Metadata={title:'threeangle / A little more connected.',description:'Bring a title you love. Discover two complementary works and the idea that brings them together.',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{triangle?:string;start?:string}>}){
 const query=await searchParams;
 return <div className={`${display.variable} ${ui.variable}`}><Hall initialId={typeof query.triangle==='string'?query.triangle:undefined} startWithTitle={query.start==='title'}/></div>;
}

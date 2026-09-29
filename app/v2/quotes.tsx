'use client';
import {useEffect,useState,type CSSProperties} from 'react';

// While the library works, lines from the work you chose are set into the room one at a time: the words rise
// out of the dark in gilt ink and cool to bone, the speaker is credited, and a hairline keeps time until the
// next line. Only verified quotes arrive here (see notableQuotes). Each line is shown once; the last one stays.
export type Quote={text:string;speaker?:string;url:string};

// Short lines are set large, long ones smaller, so every line reads in one breath at a comfortable measure.
const sizeOf=(n:number)=>n<=60?'is-short':n<=130?'is-mid':'is-long';
// Long enough to set the line and read it twice.
const dwellOf=(q:Quote)=>Math.min(16000,5600+q.text.length*65);

export function WrittenQuotes({quotes,title,still}:{quotes:Quote[];title:string;still:boolean}){
 const [n,setN]=useState(0),[leaving,setLeaving]=useState(false);
 const i=Math.min(n,quotes.length-1),q=quotes.length?quotes[i]:null;
 const last=i>=quotes.length-1;
 useEffect(()=>{
  if(!q||last)return;
  const dwell=dwellOf(q);
  const out=setTimeout(()=>setLeaving(true),dwell-650),next=setTimeout(()=>{setLeaving(false);setN(x=>x+1);},dwell);
  return()=>{clearTimeout(out);clearTimeout(next);};
 },[q,last]);
 if(!q)return null;
 const words=q.text.trim().split(/\s+/);
 const step=still?0:Math.min(140,Math.max(55,2600/words.length));
 const setTime=words.length*step+700;
 return <figure className={`hq ${sizeOf(q.text.length)} ${leaving?'is-leaving':''}`} key={i} aria-live="polite"
  style={{'--hq-set':`${setTime}ms`,'--hq-dwell':`${last?0:dwellOf(q)-setTime}ms`} as CSSProperties}>
  <span className="hq-mark" aria-hidden="true">“</span>
  <blockquote className="hq-line" aria-label={q.text}>
   <span aria-hidden="true">{words.map((w,k)=><span key={k} className="hq-w" style={{animationDelay:`${k*step}ms`}}>{w}{k<words.length-1?' ':''}</span>)}</span>
  </blockquote>
  <figcaption className="hq-by">{q.speaker&&<><span>{q.speaker}</span><span className="hq-dot" aria-hidden="true"/></>}<em>{title}</em></figcaption>
  {quotes.length>1&&<span className="hq-time" aria-hidden="true"><span className="hq-count">{String(i+1).padStart(2,'0')} / {String(quotes.length).padStart(2,'0')}</span>{!last&&<span className="hq-rule"/>}</span>}
 </figure>;
}

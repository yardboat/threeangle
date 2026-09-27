'use client';
import {useEffect,useState} from 'react';

// While the library works, lines from the work you chose are written into the room, one at a time,
// letter by letter, as if by an unseen hand. Only verified quotes arrive here (see notableQuotes).
export type Quote={text:string;speaker?:string;url:string};

export function WrittenQuotes({quotes,title,still}:{quotes:Quote[];title:string;still:boolean}){
 const [n,setN]=useState(0);
 const q=quotes.length?quotes[n%quotes.length]:null;
 useEffect(()=>{
  if(!q||quotes.length<2)return;
  // Long enough to write the line and read it twice.
  const t=setTimeout(()=>setN(x=>x+1),Math.min(16000,5200+q.text.length*70));
  return()=>clearTimeout(t);
 },[q,quotes.length]);
 if(!q)return null;
 const chars=[...q.text];const step=still?0:Math.min(38,2400/chars.length);
 return <figure className="hq" key={n} aria-live="polite">
  <blockquote className="hq-line" aria-label={q.speaker?`${q.text} (${q.speaker}, ${title})`:q.text}>
   <span aria-hidden="true">{chars.map((c,i)=><span key={i} className="hq-ch" style={{animationDelay:`${i*step}ms`}}>{c}</span>)}</span>
  </blockquote>
 </figure>;
}

'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUpRight,Share} from 'lucide-react';
import {workUrl,type Topic,type Work} from '@/lib/stories';
import {MODES,REST,Figure} from './figure';
import {Cover} from './cover';
import {worldSignal,type Room} from './world';

// The reveal, as a short walk: a congratulation, then each work on its own (yours first), then the
// finished triangle with the covers around it and the idea that holds them together.
// Each step is a different room, so the camera walks between them and the archive flickers past.

const letters=['a','b','c'];
const safeUrl=(url:string)=>/^https?:\/\//i.test(url)?url:'#';
export const REVEAL_ROOMS:Room[]=['stairs','frames','gallery','maproom','rotunda'];
const sizeOf=(n:string)=>n.length>30?'is-xlong':n.length>20?'is-long':n.length>13?'is-mid':'';
const titleSize=(n:string)=>n.length>44?'is-long':n.length>24?'is-mid':'';

function WorkLink({work,children}:{work:Work;children:ReactNode}){
 return <a className="hall-quiet" href={safeUrl(workUrl(work))} target="_blank" rel="noopener noreferrer">{children} <ArrowUpRight size={14}/><span className="hall-sr"> (opens in a new tab)</span></a>;
}

// The story card (/api/card): a 1080×1920 JPEG. On a phone it goes to the share sheet as an image alone (so
// Instagram Stories is offered); on a computer it simply downloads, ready to AirDrop or post.
function StoryButton({topic}:{topic:Topic}){
 const [state,setState]=useState<'idle'|'making'|'saved'|'failed'>('idle');
 const make=async()=>{
  if(state==='making')return;setState('making');
  try{
   const res=await fetch('/api/card?id='+encodeURIComponent(topic.id));if(!res.ok)throw new Error('card');
   const file=new File([await res.blob()],`threeangle-${topic.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}.jpg`,{type:'image/jpeg'});
   const phone=matchMedia('(pointer: coarse)').matches;
   if(phone&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file]});}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))throw e;}setState('idle');return;}
   const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);setState('saved');
  }catch{setState('failed');}
 };
 return <button className="hall-cta hall-cta-light rw-story" onClick={()=>void make()} disabled={state==='making'} aria-live="polite">
  <Share size={16}/> {state==='making'?'Making your card…':state==='saved'?'Saved. Post it to your story':state==='failed'?'Try that again':'Share to your story'}
 </button>;
}

export function Reveal({topic,still,onRoom,footer}:{topic:Topic;still:boolean;onRoom:(r:Room)=>void;footer:ReactNode}){
 const main=topic.works.slice(0,3);
 const seedIndex=Math.max(0,main.findIndex(w=>w.title===topic.seedTitle));
 // Yours first, then the other two in read, watch, listen order.
 const order=[seedIndex,...[0,1,2].filter(i=>i!==seedIndex)];
 const [step,setStep]=useState(0);
 const top=useRef<HTMLDivElement>(null);
 const last=4;
 const go=useCallback((next:number)=>{
  const s=Math.max(0,Math.min(last,next));setStep(s);
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:still?'instant':'smooth'}));
 },[still]);
 useEffect(()=>{onRoom(REVEAL_ROOMS[step]);},[step,onRoom]);
 // The oculus gathers on the finished triangle.
 useEffect(()=>{worldSignal.beam=step===last?1:0;return()=>{worldSignal.beam=0;};},[step]);
 useEffect(()=>{
  const onKey=(e:globalThis.KeyboardEvent)=>{
   if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||(e.target as HTMLElement).closest?.('input,textarea,select,dialog,[contenteditable="true"]'))return;
   if(e.key==='ArrowRight'&&step<last){e.preventDefault();go(step+1);}
   else if(e.key==='ArrowLeft'&&step>0){e.preventDefault();go(step-1);}
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[step,go]);
 const faces=main.map((w,i)=>({title:w.title,creator:w.creator,seed:i===seedIndex}));

 if(step===0)return <div className="rw rw-intro hall-enter" ref={top} key="intro">
  <p className="hall-kicker">{topic.seedTitle?'Congratulations':'From the collection'}</p>
  <h1 className="hall-mega">Your threeangle<br/>is ready.</h1>
  <p className="rw-intro-sub">{topic.seedTitle?<>Three works, one idea. It starts with <em>{topic.seedTitle}</em>.</>:'Three works, one idea.'}</p>
  <Figure variant="hero" faces={faces} labels={['a','b','c']} view={null} idle still={still} label="Your threeangle, waiting to be revealed"/>
  <button className="hall-cta hall-cta-light" onClick={()=>go(1)} autoFocus>Reveal your triangle <ArrowRight size={17}/></button>
 </div>;

 if(step<=3){
  const i=order[step-1],work=main[i];
  const lit={corners:new Set([i]),sides:new Set<number>()};
  // The work itself stands beside its face of the drawing: its cover, nothing else.
  const callout={face:i,content:<Cover work={work} size="m" className="rw-callout-cover"/>};
  return <div className="rw rw-work hall-enter" key={'w'+step}>
   <header className="rw-work-head">
    <p className="hall-kicker">{MODES[i]} · {work.format}</p>
    <Cover work={work} size="m" className="rw-cover-inline"/>
    <h1 className={`rw-title ${titleSize(work.title)}`}>{work.title}</h1>
    <p className="rw-by">{work.creator}</p>
   </header>
   <div className="rw-work-stage">
    <Figure faces={faces} view={{turn:i*120,el:20}} still={still} lit={lit} callout={callout} label={`${work.title}, face ${letters[i]} of your threeangle`}/>
   </div>
   <div className="rw-why">
    <p className="rw-why-text">{topic.answers?.[i]||work.pitch}</p>
   </div>
   <nav className="rw-nav" aria-label="Reveal">
    <button className="hall-quiet" onClick={()=>go(step-1)}><ArrowLeft size={14}/> Back</button>
    <button className="hall-cta hall-cta-light" onClick={()=>go(step+1)} autoFocus>{step<3?`Next: ${MODES[order[step]]}`:'See your triangle'} <ArrowRight size={17}/></button>
   </nav>
  </div>;
 }

 const bonus=topic.works[3];
 return <div className="rw-final" key="final">
  <div className="rw rw-triangle hall-enter">
   <header className="rw-final-head">
    <p className="hall-kicker">Your threeangle <span>·</span> {topic.seedTitle?'Made for you':'From the curated collection'}</p>
    <h1 className={`hall-mega rv-name ${sizeOf(topic.name)}`}>{topic.name}</h1>
    <p className="rv-hook">{topic.hook}</p>
   </header>
   {/* The drawing holds the centre; the three works stand at its corners on a grid, so nothing ever sits on it. */}
   <div className="rw-constellation">
    <div className="rw-figure">
     <div className="rv-shaft" aria-hidden="true"/>
     <Figure faces={faces} view={REST} idle still={still} lit={{corners:new Set([0,1,2]),sides:new Set([0,1,2])}} orbitWorld label={`Your threeangle: ${main.map((w,i)=>`${MODES[i]}, ${w.title}`).join('; ')}`}/>
    </div>
    {main.map((w,i)=><a key={i} className={`rw-orbit rw-orbit-${letters[i]}`} href={`#rw-work-${i}`}><Cover work={w} size="m"/><span className="rw-orbit-text"><span className="hall-kicker">{MODES[i]}</span><span className="rw-orbit-title">{w.title}</span></span></a>)}
   </div>
   <StoryButton topic={topic}/>
   <button className="hall-quiet rw-down" onClick={()=>document.getElementById('rw-together')?.scrollIntoView({behavior:still?'instant':'smooth'})}>How they connect <ArrowDown size={14}/></button>
  </div>
  <section id="rw-together" className="rw-together">
   <p className="hall-kicker">The common thread</p>
   <h2>{topic.shift}</h2>
   <p className="rw-together-lede">{topic.payoff||topic.intro}</p>
   <ol className="rw-works">{main.map((w,i)=><li key={i} id={`rw-work-${i}`}>
    <Cover work={w} size="s"/>
    <div>
     <p className="hall-kicker">{MODES[i]} · {w.format}</p>
     <h3>{w.title}</h3>
     <p className="rw-by">{w.creator}</p>
     <p className="rw-works-why">{topic.answers?.[i]||w.pitch}</p>
     <WorkLink work={w}>Explore</WorkLink>
    </div>
   </li>)}</ol>
  </section>
  {bonus&&<section className="rw-bonus">
   <h2 className="hall-mega hall-mega-s">Bonus Angle</h2>
   <p className="rw-bonus-sub">Want to go even deeper?</p>
   <div className="rw-bonus-work">
    <Cover work={bonus} size="m"/>
    <div>
     <p className="hall-kicker">{bonus.format}</p>
     <h3>{bonus.title}</h3>
     <p className="rw-by">{bonus.creator}</p>
     {topic.bonus&&<p className="rw-bonus-head">{topic.bonus}</p>}
     <p className="rw-works-why">{bonus.pitch}</p>
     <WorkLink work={bonus}>Explore the bonus</WorkLink>
    </div>
   </div>
  </section>}
  {footer}
  <div className="rw-again"><button className="hall-quiet" onClick={()=>go(1)}><ArrowLeft size={14}/> Walk the three works again</button></div>
 </div>;
}

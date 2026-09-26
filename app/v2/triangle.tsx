'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUpRight,Plus,X} from 'lucide-react';
import {workUrl,type Topic} from '@/lib/stories';
import {STEPS,ends,lightFor,sameFocus,stepOf,type Focus} from '@/lib/triangle-focus';
import {MODES,Prism,viewFor} from './prism';
import {worldSignal} from './world';
import {HallMark} from './geometry';

// The reveal: the finished threeangle stands in the Rotunda under the oculus.
// Turn it (drag, the step rail, arrow keys) and the reading note beside it follows.
// Structure and focus logic are unchanged from round two (lib/triangle-focus.ts); the geometry is now physical.

const letters=['a','b','c'];
const safeUrl=(url:string)=>/^https?:\/\//i.test(url)?url:'#';
const stepName=(f:Focus)=>f.kind==='center'?'The common thread':f.kind==='vertex'?`${letters[f.index].toUpperCase()} · ${MODES[f.index]}`:`${MODES[ends(f.index)[0]]} + ${MODES[ends(f.index)[1]]}`;

function Note({topic,focus,onSelect,onWalk,onConnection}:{topic:Topic;focus:Focus|null;onSelect:(f:Focus)=>void;onWalk:()=>void;onConnection:()=>void}){
 if(!focus)return <div className="rv-note-body rv-note-intro">
  <p className="hall-kicker">Three works · one thread</p>
  <p className="rv-note-lede">Each face is a work. Each gilded edge, the thread between two. The crown holds what all three share.</p>
  <button className="hall-cta hall-cta-light" onClick={onWalk}>Walk the triangle <ArrowRight size={16}/></button>
  <p className="rv-note-tip">Drag the prism to turn it.</p>
 </div>;
 if(focus.kind==='vertex'){
  const i=focus.index,work=topic.works[i],seed=work.title===topic.seedTitle;
  return <div className="rv-note-body" key={'v'+i}>
   <p className="hall-kicker"><b>{letters[i]}</b> {MODES[i]} · {work.format}{seed?' · You brought this':''}</p>
   <h2>{topic.heads?.[i]||work.title}</h2>
   <p>{work.pitch}</p>
   {topic.angles?.[i]&&<p className="rv-note-seen"><span className="hall-kicker">Seen as · {topic.angles[i]}</span>{topic.answers?.[i]}</p>}
   <a className="hall-quiet" href={safeUrl(workUrl(work))} target="_blank" rel="noopener noreferrer">Explore {work.title.length>34?'the work':work.title} <ArrowUpRight size={14}/><span className="hall-sr"> (opens in a new tab)</span></a>
  </div>;
 }
 if(focus.kind==='edge'){
  const [a,b]=ends(focus.index);
  return <div className="rv-note-body" key={'e'+focus.index}>
   <p className="hall-kicker">The thread · {MODES[a]} + {MODES[b]}</p>
   <h2 className="rv-note-bridge">{topic.bridges?.[focus.index]}</h2>
   <div className="rv-note-ends">{[a,b].map(c=><button key={c} onClick={()=>onSelect({kind:'vertex',index:c})}><span className="hall-kicker"><b>{letters[c]}</b> {MODES[c]}</span><span>{topic.works[c].title}</span></button>)}</div>
  </div>;
 }
 return <div className="rv-note-body" key="c">
  <p className="hall-kicker">The common thread</p>
  <h2 className="rv-note-bridge">{topic.question}</h2>
  {topic.angles.length>0&&<ol className="rv-note-angles">{topic.angles.slice(0,3).map((angle,i)=><li key={i}><b>{letters[i]}</b>{angle}</li>)}</ol>}
  <button className="hall-quiet" onClick={onConnection}>See them together <ArrowDown size={14}/></button>
 </div>;
}

export function TriangleReveal({topic,instant,heading,actions}:{topic:Topic;instant:boolean;heading:ReactNode;actions?:ReactNode}){
 const [focus,setFocus]=useState<Focus|null>(null),[hover,setHover]=useState<Focus|null>(null),[deeper,setDeeper]=useState(false);
 const connection=useRef<HTMLDivElement>(null);
 const active=hover??focus;const light=lightFor(active);const step=stepOf(focus);
 const select=(f:Focus)=>setFocus(current=>sameFocus(current,f)?null:f);
 const pick=(f:Focus)=>setFocus(f);
 const walk=useCallback((delta:number)=>setFocus(current=>STEPS[Math.min(STEPS.length-1,Math.max(0,stepOf(current)+delta))]),[]);
 // The oculus light gathers on the crown when the common thread is open.
 useEffect(()=>{worldSignal.beam=focus?.kind==='center'?1:0;return()=>{worldSignal.beam=0;};},[focus]);
 useEffect(()=>{
  const onKey=(e:globalThis.KeyboardEvent)=>{
   if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||(e.target as HTMLElement).closest?.('input,textarea,select,dialog,[contenteditable="true"]'))return;
   if(e.key==='Escape'&&focus)setFocus(null);
   else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();walk(e.key==='ArrowRight'?1:-1);}
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[focus,walk]);
 const showConnection=()=>{setDeeper(true);requestAnimationFrame(()=>connection.current?.scrollIntoView({behavior:instant?'instant':'smooth',block:'start'}));};
 const faces=topic.works.slice(0,3).map(w=>({title:w.title,creator:w.creator,format:w.format,seed:w.title===topic.seedTitle}));
 return <>
  <div className={`rv ${focus?'rv-open':''} ${focus?.kind==='center'?'rv-crowned':''}`}>
   {heading}
   <div className="rv-stage">
    <div className="rv-shaft" aria-hidden="true"/>
    <Prism faces={faces} crown={<>{topic.question}</>} mark={<HallMark/>} view={viewFor(focus)} idle still={instant} lit={light} onPick={pick} orbitWorld label={`Your threeangle: ${topic.works.slice(0,3).map((w,i)=>`${MODES[i]}, ${w.title}`).join('; ')}`}/>
    {actions}
   </div>
   <aside id="hall-reading-note" className="rv-note" aria-live="polite">
    <Note topic={topic} focus={focus} onSelect={select} onWalk={()=>setFocus(STEPS[0])} onConnection={showConnection}/>
    {focus&&<button className="rv-note-close" onClick={()=>setFocus(null)} aria-label="Close the note"><X size={18}/></button>}
   </aside>
   <nav className="rv-walk" aria-label="Walk the triangle">
    <button className="rv-walk-arrow" onClick={()=>walk(-1)} disabled={step<=0} aria-label="Previous"><ArrowLeft size={16}/></button>
    <ol>{STEPS.map((s,i)=><li key={i}><button className={`rv-pip rv-pip-${s.kind} ${i===step?'is-current':''} ${light.corners.size===3||(s.kind==='vertex'&&light.corners.has(s.index))||(s.kind==='edge'&&light.sides.has(s.index))?'is-lit':''}`} aria-current={i===step?'step':undefined} onClick={()=>select(s)} onPointerEnter={e=>{if(e.pointerType==='mouse')setHover(s);}} onPointerLeave={()=>setHover(null)}><span className="hall-sr">{stepName(s)}</span></button></li>)}</ol>
    <button className="rv-walk-arrow" onClick={()=>walk(1)} disabled={step>=STEPS.length-1} aria-label="Next"><ArrowRight size={16}/></button>
    <span className="rv-walk-count" aria-hidden="true">{focus?stepName(focus):'Walk the triangle'}<i>{String(Math.max(step,0)+1).padStart(2,'0')} / 07</i></span>
   </nav>
  </div>
  <section ref={connection} id="hall-connection" className={`rv-together ${focus?.kind==='center'?'is-active':''}`}>
   <p className="hall-kicker">See them together</p>
   <h2>{topic.shift}</h2>
   <p className="rv-together-lede">{topic.payoff||topic.intro}</p>
   <details className="rv-deeper" open={deeper} onToggle={e=>setDeeper(e.currentTarget.open)}>
    <summary>Follow the connection deeper <Plus size={15}/></summary>
    <p>{topic.intro}</p>
    <div className="rv-deeper-grid">{topic.angles.map((angle,i)=><div key={i}><span className="hall-kicker"><b>{letters[i]}</b> {MODES[i]}</span><h3>{angle}</h3><p>{topic.answers[i]}</p></div>)}</div>
   </details>
  </section>
 </>;
}
